/**
 * 账户批量注册机页面
 * 直接集成批量注册随机用户功能
 */
import React, { useState, useEffect } from 'react';
import { 
  Card, 
  Typography, 
  Form, 
  InputNumber, 
  Button, 
  Checkbox, 
  Space, 
  Divider, 
  Select, 
  Input, 
  Tooltip, 
  Table, 
  Tag, 
  message, 
  Progress, 
  Result, 
  Spin,
  Descriptions
} from 'antd';
import {
  UserAddOutlined,
  InfoCircleOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  DeleteOutlined,
  SafetyCertificateOutlined,
  IdcardOutlined,
  CreditCardOutlined,
  TeamOutlined,
  PlusOutlined,
  NumberOutlined
} from '@ant-design/icons';
import api, { infiniAccountApi, emailAccountApi, apiBaseUrl } from '../../services/api';
import styled from 'styled-components';

const { Title, Text } = Typography;

// 玻璃卡片效果
const GlassCard = styled(Card)`
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.18);
  margin-bottom: 24px;
`;

// 注册结果接口
interface RegisterResult {
  success: boolean;
  accountId?: number;
  email?: string;
  userId?: string;
  is2faEnabled?: boolean;
  isKycEnabled?: boolean;
  isCardEnabled?: boolean;
  message?: string;
}

/**
 * 账户批量注册机页面组件
 */
const AccountRegister: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [emailAccounts, setEmailAccounts] = useState<any[]>([]);
  const [loadingEmails, setLoadingEmails] = useState(false);
  const [accountGroups, setAccountGroups] = useState<any[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [mainEmail, setMainEmail] = useState<string>('');
  const [selectedEmailId, setSelectedEmailId] = useState<string>('');
  const [invitationCode, setInvitationCode] = useState<string>('TC7MLI9');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [newGroupName, setNewGroupName] = useState<string>('');
  const [creatingGroup, setCreatingGroup] = useState(false);

  // 批量注册相关状态
  const [currentCount, setCurrentCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const [registrationComplete, setRegistrationComplete] = useState(false);
  const [registerResults, setRegisterResults] = useState<RegisterResult[]>([]);
  
  // 引用类型，用于在组件内部跟踪注册状态，避免依赖React状态更新
  const registeringRef = React.useRef(false);

  // 获取邮箱账户列表和账户分组列表
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoadingEmails(true);
        setLoadingGroups(true);
        
        // 获取所有邮箱账户
        const emailResponse = await emailAccountApi.getAllEmailAccounts();
        if (emailResponse.success && emailResponse.data) {
          console.log('获取到邮箱账户列表:', emailResponse.data);
          setEmailAccounts(emailResponse.data);
          
          // 如果有默认邮箱账户，自动选中
          const defaultAccount = emailResponse.data.find((account: any) => account.isDefault);
          if (defaultAccount) {
            setMainEmail(defaultAccount.email);
            setSelectedEmailId(defaultAccount.id);
            form.setFieldsValue({ mainEmail: defaultAccount.id });
            console.log('自动选择默认邮箱:', defaultAccount.email, '邮箱ID:', defaultAccount.id);
          }
        }
        
        // 获取所有账户分组
        const groupResponse = await infiniAccountApi.getAllAccountGroups();
        if (groupResponse.success && groupResponse.data) {
          console.log('获取到账户分组列表:', groupResponse.data);
          setAccountGroups(groupResponse.data);
          
          // 如果有默认分组，自动选中
          const defaultGroup = groupResponse.data.find((group: any) => group.name === '默认分组');
          if (defaultGroup) {
            setSelectedGroupId(defaultGroup.id);
            form.setFieldsValue({ groupId: defaultGroup.id });
            console.log('自动选择默认分组:', defaultGroup.name, '分组ID:', defaultGroup.id);
          }
        }
      } catch (error) {
        console.error('获取初始数据失败:', error);
        message.error('获取初始数据失败，请稍后重试');
      } finally {
        setLoadingEmails(false);
        setLoadingGroups(false);
      }
    };
    
    fetchData();
  }, [form]);
  
  // 重置状态
  const resetState = () => {
    form.resetFields();
    setRegisterResults([]);
    setCurrentCount(0);
    setTotalCount(0);
    setBatchRunning(false);
    setBatchProgress(0);
    setRegistrationComplete(false);
    registeringRef.current = false;
  };
  
  // 处理主邮箱改变事件
  const handleMainEmailChange = (value: string) => {
    // 根据选中的ID找到对应的邮箱对象
    const selectedEmail = emailAccounts.find(account => account.id === value);
    if (selectedEmail) {
      setMainEmail(selectedEmail.email); // 保存邮箱地址用于显示
      setSelectedEmailId(value); // 保存邮箱ID用于API调用
      console.log('已选择主邮箱:', selectedEmail.email, '邮箱ID:', value);
    }
  };
  
  // 处理分组改变事件
  const handleGroupChange = (value: string) => {
    setSelectedGroupId(value);
    console.log('已选择分组ID:', value);
  };
  
  // 创建新分组
  const handleCreateGroup = async () => {
    if (!newGroupName || newGroupName.trim() === '') {
      message.error('分组名称不能为空');
      return;
    }
    
    try {
      setCreatingGroup(true);
      const response = await infiniAccountApi.createAccountGroup({
        name: newGroupName.trim()
      });
      
      if (response.success && response.data) {
        message.success('创建分组成功');
        console.log('创建分组成功:', response.data);
        
        // 添加新分组到列表
        setAccountGroups([...accountGroups, response.data]);
        
        // 自动选中新创建的分组
        setSelectedGroupId(response.data.id);
        form.setFieldsValue({ groupId: response.data.id });
        
        // 清空输入框
        setNewGroupName('');
      } else {
        message.error(response.message || '创建分组失败');
      }
    } catch (error) {
      console.error('创建分组失败:', error);
      message.error('创建分组失败，请稍后重试');
    } finally {
      setCreatingGroup(false);
    }
  };

  // 执行单次注册
  const executeSingleRegister = async (values: any, index: number): Promise<RegisterResult> => {
    try {
      // 准备请求参数
      const setupOptions = {
        enable2fa: values.enable2fa,
        enableKyc: values.enableKyc,
        enableCard: values.enableCard,
        cardType: 3 // 默认使用Card 3
      };
      
      // 提取后缀，并准备数据
      let emailSuffix = '';
      if (mainEmail) { // 使用mainEmail变量(存储了邮箱地址)来提取后缀
        // 尝试从主邮箱中提取后缀
        const atIndex = mainEmail.indexOf('@');
        if (atIndex !== -1) {
          emailSuffix = mainEmail.substring(atIndex + 1);
        }
      }
      
      // 如果无法从主邮箱提取后缀，使用默认值
      if (!emailSuffix) {
        emailSuffix = 'protonmail.com';
      }
      
      const userData = {
        email_suffix: emailSuffix, // 为了满足API类型要求
        main_email: selectedEmailId, // 使用邮箱ID作为主邮箱标识
        invitation_code: values.invitationCode || invitationCode, // 使用表单中的邀请码，如果没有则使用默认值
        group_id: values.groupId || selectedGroupId // 使用选中的分组ID
      };
      
      console.log(`执行第 ${index+1} 次注册，参数:`, { setupOptions, userData });
      
      // 直接使用axios发送请求，避免可能的API封装问题
      const requestData = {
        setupOptions,
        userData
      };
      
      console.log(`直接发送API请求，数据:`, JSON.stringify(requestData, null, 2));
      
      // 调用后端API
      const response = await api.post(`${apiBaseUrl}/api/infini-accounts/one-click-setup`, requestData);
      
      console.log(`第 ${index+1} 次注册原始响应:`, response);
      
      // 解构响应数据
      const responseData = response.data;
      
      console.log(`第 ${index+1} 次注册响应数据:`, responseData);
      
      if (!responseData.success) {
        throw new Error(responseData.message || '注册失败');
      }
      
      // 提取响应数据
      const { accountId, randomUser, account, steps } = responseData;
      
      // 确定各步骤执行状态
      const is2faEnabled = steps && steps.twoFa && steps.twoFa.success || false;
      const isKycEnabled = steps && steps.kyc && steps.kyc.success || false;
      const isCardEnabled = steps && steps.card && steps.card.success || false;
      
      // 返回注册结果
      return {
        success: true,
        accountId: account.id,
        email: randomUser.full_email,
        userId: account.userId,
        is2faEnabled,
        isKycEnabled,
        isCardEnabled,
      };
    } catch (error: any) {
      console.error(`第 ${index+1} 次注册出错:`, error);
      return {
        success: false,
        message: error.message || '注册失败，请重试'
      };
    }
  };
  
  // 提交表单开始批量注册
  const handleSubmit = async (values: any) => {
    try {
      setLoading(true);
      setRegistrationComplete(false);
      
      // 设置批量注册状态
      const batchCount = values.batchCount || 1;
      setTotalCount(batchCount);
      setCurrentCount(0);
      setBatchProgress(0);
      setRegisterResults([]);
      
      // 使用useRef引用变量控制循环，避免依赖React状态
      registeringRef.current = true;
      
      // 立即设置批量注册状态，让UI立即显示进度和状态
      setBatchRunning(true);
      
      // 给UI一点时间更新，显示进度条
      await new Promise(resolve => setTimeout(resolve, 100));
      
      console.log('开始批量注册，计划注册数量:', batchCount, '注册状态:', registeringRef.current);
      
      // 循环执行注册
      for (let i = 0; i < batchCount && registeringRef.current; i++) {
        console.log(`开始第 ${i+1}/${batchCount} 次注册...`);
        
        // 执行单次注册
        const result = await executeSingleRegister(values, i);
        
        // 检查是否取消了注册过程
        if (!registeringRef.current) {
          console.log('批量注册已被中断');
          break;
        }
        
        console.log(`第 ${i+1}/${batchCount} 次注册完成，结果:`, result.success ? '成功' : '失败');
        
        // 更新进度
        setCurrentCount(i + 1);
        setBatchProgress(Math.floor(((i + 1) / batchCount) * 100));
        
        // 更新结果列表
        setRegisterResults(prevResults => [...prevResults, result]);
        
        // 如果不是最后一次且未取消，添加一些延迟避免API限流
        if (i < batchCount - 1 && registeringRef.current) {
          console.log(`等待500ms后继续下一次注册...`);
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      // 完成批量注册或已取消
      console.log('批量注册流程结束');
      registeringRef.current = false;
      setBatchRunning(false);
      
      // 获取最终结果统计
      const totalResults = registerResults.length;
      const successCount = registerResults.filter(r => r.success).length;
      const failedCount = totalResults - successCount;
      
      if (totalResults > 0) {
        // 设置注册完成状态，显示完成信息
        setRegistrationComplete(true);
        
        message.success(`批量注册完成，成功: ${successCount}，失败: ${failedCount}`);
        console.log(`批量注册完成，总计: ${totalResults}，成功: ${successCount}，失败: ${failedCount}`);
      } else {
        console.log('批量注册被取消，未完成任何注册');
      }
    } catch (error: any) {
      console.error('批量注册出错:', error);
      message.error('批量注册失败: ' + error.message);
      registeringRef.current = false;
      setBatchRunning(false);
    } finally {
      setLoading(false);
    }
  };
  
  // 取消批量注册
  const handleCancel = () => {
    if (batchRunning) {
      message.info('正在取消批量注册...');
      registeringRef.current = false;
    } else {
      resetState();
    }
  };
  
  // 表格列定义
  const columns = [
    {
      title: '账户ID',
      dataIndex: 'accountId',
      key: 'accountId',
      width: 80,
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: '用户ID',
      dataIndex: 'userId',
      key: 'userId',
      width: 280,
      ellipsis: true,
    },
    {
      title: '2FA状态',
      dataIndex: 'is2faEnabled',
      key: 'is2faEnabled',
      width: 100,
      render: (is2faEnabled: boolean) => 
        is2faEnabled ? 
          <Tag color="success">已开启</Tag> : 
          <Tag color="default">未开启</Tag>
    },
    {
      title: 'KYC状态',
      dataIndex: 'isKycEnabled',
      key: 'isKycEnabled',
      width: 100,
      render: (isKycEnabled: boolean) => 
        isKycEnabled ? 
          <Tag color="success">已认证</Tag> : 
          <Tag color="default">未认证</Tag>
    },
    {
      title: '卡片状态',
      dataIndex: 'isCardEnabled',
      key: 'isCardEnabled',
      width: 100,
      render: (isCardEnabled: boolean) => 
        isCardEnabled ? 
          <Tag color="success">已开通</Tag> : 
          <Tag color="default">未开通</Tag>
    },
    {
      title: '状态',
      key: 'status',
      width: 100,
      render: (_: any, record: RegisterResult) => {
        if (record.success) {
          return <Text type="success" strong><CheckCircleOutlined /> 成功</Text>;
        } else {
          return <Text type="danger"><DeleteOutlined /> 失败</Text>;
        }
      },
    },
  ];

  // 渲染批量注册表单
  const renderRegisterForm = () => (
    <Form
      form={form}
      layout="vertical"
      onFinish={handleSubmit}
      initialValues={{
        enable2fa: true,
        enableKyc: true,
        enableCard: true,
        mainEmail: selectedEmailId,
        invitationCode: invitationCode,
        batchCount: 5 // 默认批量注册5个
      }}
    >
      <Form.Item
        name="batchCount"
        label={
          <Space>
            <NumberOutlined />
            <span>批量注册数量</span>
            <Tooltip title="设置要一次性批量注册的账户数量">
              <InfoCircleOutlined style={{ color: '#1890ff' }} />
            </Tooltip>
          </Space>
        }
        rules={[
          { required: true, message: '请输入批量注册数量' },
          { type: 'number', min: 1, max: 50, message: '批量注册数量必须在1-50之间' }
        ]}
      >
        <InputNumber min={1} max={50} style={{ width: '100%' }} placeholder="请输入批量注册数量" />
      </Form.Item>
      
      <Divider orientation="left">主邮箱选择</Divider>
      
      <Form.Item 
        name="mainEmail" 
        label="选择主邮箱 (用于接收验证码)" 
        rules={[{ required: true, message: '请选择一个主邮箱' }]}
      >
        <Select
          placeholder="请选择主邮箱"
          loading={loadingEmails}
          onChange={handleMainEmailChange}
          showSearch
          optionFilterProp="children"
          filterOption={(input, option) =>
            (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
          }
          options={emailAccounts.map(account => ({
            value: account.id,
            label: `${account.email}${account.isDefault ? ' (默认)' : ''}`,
          }))}
        />
      </Form.Item>
      
      <Form.Item 
        name="groupId" 
        label={
          <Space>
            <TeamOutlined />
            <span>账户分组</span>
            <Tooltip title="选择要将新账户添加到的分组，可以创建新分组">
              <InfoCircleOutlined style={{ color: '#1890ff' }} />
            </Tooltip>
          </Space>
        }
        rules={[{ required: true, message: '请选择一个账户分组' }]}
      >
        <Select
          placeholder="请选择账户分组"
          loading={loadingGroups}
          onChange={handleGroupChange}
          showSearch
          optionFilterProp="children"
          filterOption={(input, option) =>
            (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
          }
          dropdownRender={(menu) => (
            <>
              {menu}
              <Divider style={{ margin: '8px 0' }} />
              <Space style={{ padding: '0 8px 4px' }}>
                <Input
                  placeholder="输入新分组名称"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateGroup()}
                />
                <Button
                  type="text"
                  icon={<PlusOutlined />}
                  loading={creatingGroup}
                  onClick={handleCreateGroup}
                >
                  创建分组
                </Button>
              </Space>
            </>
          )}
          options={accountGroups.map(group => ({
            value: group.id,
            label: group.name,
          }))}
        />
      </Form.Item>
      
      <Form.Item
        name="invitationCode"
        label="邀请码"
        rules={[{ required: true, message: '请输入邀请码' }]}
      >
        <Input placeholder="请输入邀请码" defaultValue="TC7MLI9" />
      </Form.Item>
      
      <Divider orientation="left">自动化步骤选择</Divider>
      
      <Form.Item name="enable2fa" valuePropName="checked">
        <Checkbox>
          <Space>
            <SafetyCertificateOutlined />
            自动开启2FA
          </Space>
        </Checkbox>
      </Form.Item>
      
      <Form.Item name="enableKyc" valuePropName="checked">
        <Checkbox>
          <Space>
            <IdcardOutlined />
            自动进行KYC认证
          </Space>
        </Checkbox>
      </Form.Item>
      
      <Form.Item name="enableCard" valuePropName="checked">
        <Checkbox>
          <Space>
            <CreditCardOutlined />
            自动开通卡片
          </Space>
        </Checkbox>
      </Form.Item>
      
      <Form.Item>
        <Text type="secondary">
          <InfoCircleOutlined style={{ marginRight: 8 }} />
          批量注册将自动完成选定的所有步骤，为每个账户执行相同的操作
        </Text>
      </Form.Item>
      
      <Form.Item>
        <Button
          type="primary"
          htmlType="submit"
          size="large"
          loading={loading}
          block
        >
          开始批量注册
        </Button>
      </Form.Item>
    </Form>
  );
  
  // 渲染批量注册进度
  const renderBatchProgress = () => (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text strong>批量注册进度：{currentCount}/{totalCount}</Text>
        <Text>{batchProgress}%</Text>
      </div>
      <Progress percent={batchProgress} status={batchRunning ? "active" : "normal"} />
    </div>
  );
  
  // 渲染完成状态
  const renderCompletionStatus = () => {
    if (!registrationComplete) return null;
    
    const successCount = registerResults.filter(r => r.success).length;
    const failedCount = registerResults.filter(r => !r.success).length;
    
    return (
      <Result
        status="success"
        title={`批量注册完成 ${successCount}/${totalCount}`}
        subTitle={`成功: ${successCount} 个, 失败: ${failedCount} 个`}
        style={{ marginBottom: 16 }}
      />
    );
  };
  
  // 渲染进行中或已完成的UI
  const renderProcessingUI = () => (
    <div>
      {/* 进度显示区域 */}
      {renderBatchProgress()}
      
      {/* 完成状态显示 */}
      {renderCompletionStatus()}
      
      {/* 操作按钮 */}
      <div style={{ marginBottom: 20, textAlign: 'center' }}>
        {batchRunning ? (
          <Button type="primary" danger onClick={handleCancel}>
            取消批量注册
          </Button>
        ) : (
          <Button type="primary" onClick={resetState}>
            重新开始
          </Button>
        )}
      </div>
      
      {/* 结果表格 */}
      <Table
        dataSource={registerResults}
        columns={columns}
        rowKey={(record, index) => `${record.accountId || ''}${index}`}
        pagination={false}
        scroll={{ y: 400 }}
        loading={batchRunning}
      />
    </div>
  );
  
  return (
    <div>
      <Title level={3}>
        账户批量注册机
        {batchRunning && <span style={{ marginLeft: 8, fontSize: '0.9em', color: '#1890ff' }}>(进行中...)</span>}
        {registrationComplete && <span style={{ marginLeft: 8, fontSize: '0.9em', color: '#52c41a' }}>(已完成)</span>}
      </Title>
      
      <div style={{ display: 'flex', gap: '24px' }}>
        {/* 左侧表单区域 */}
        <GlassCard style={{ width: batchRunning || registerResults.length > 0 ? '30%' : '100%' }}>
          <Spin spinning={loading && !batchRunning}>
            {renderRegisterForm()}
          </Spin>
        </GlassCard>
        
        {/* 右侧结果区域 - 有进度或结果时才显示 */}
        {(batchRunning || registerResults.length > 0) && (
          <GlassCard style={{ width: '70%', maxHeight: '80vh', overflowY: 'auto' }}>
            {renderProcessingUI()}
          </GlassCard>
        )}
      </div>
    </div>
  );
};

export default AccountRegister;