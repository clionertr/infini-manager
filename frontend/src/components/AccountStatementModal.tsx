import React from 'react';
import { Modal, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import moment from 'moment';

interface StatementItem {
  id: number;
  tx_id: string;
  field: string;
  change_type: number;
  change: number;
  status: number;
  pre_balance: number;
  balance: number;
  created_at: number;
  metadata: Record<string, any>;
}

interface AccountStatementModalProps {
  visible: boolean;
  loading: boolean;
  items: StatementItem[];
  total: number;
  onCancel: () => void;
  onPageChange: (page: number, pageSize?: number) => void;
  currentPage: number;
  pageSize: number;
}

// 映射 change_type 到可读文本
const changeTypeMap: Record<number, string> = {
  1: '充值',
  2: '提现',
  3: '转账收入',
  4: '转账支出',
  5: '手续费',
  6: '退款',
  7: '系统调整',
  // 可以根据实际情况添加更多类型
};

// 映射 status 到可读文本
const statusMap: Record<number, { text: string; color: string }> = {
  0: { text: '处理中', color: 'gold' },
  1: { text: '成功', color: 'green' },
  2: { text: '失败', color: 'red' },
  3: { text: '已取消', color: 'default' },
  // 可以根据实际情况添加更多状态
};

const AccountStatementModal: React.FC<AccountStatementModalProps> = ({
  visible,
  loading,
  items,
  total,
  onCancel,
  onPageChange,
  currentPage,
  pageSize,
}) => {
  const columns: ColumnsType<StatementItem> = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
    },
    {
      title: '外部交易ID',
      dataIndex: 'tx_id',
      key: 'tx_id',
      render: (text) => text || '-',
    },
    {
      title: '字段',
      dataIndex: 'field',
      key: 'field',
    },
    {
      title: '变更类型',
      dataIndex: 'change_type',
      key: 'change_type',
      render: (type) => changeTypeMap[type] || `未知类型 (${type})`,
    },
    {
      title: '变更金额',
      dataIndex: 'change',
      key: 'change',
      render: (amount) => (
        <span style={{ color: amount < 0 ? 'red' : 'green' }}>
          {amount.toFixed(6)}
        </span>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status) => {
        const statusInfo = statusMap[status] || { text: `未知状态 (${status})`, color: 'grey' };
        return <Tag color={statusInfo.color}>{statusInfo.text}</Tag>;
      },
    },
    {
      title: '变更前余额',
      dataIndex: 'pre_balance',
      key: 'pre_balance',
      render: (amount) => amount.toFixed(6),
    },
    {
      title: '变更后余额',
      dataIndex: 'balance',
      key: 'balance',
      render: (amount) => amount.toFixed(6),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (timestamp) => moment.unix(timestamp).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '元数据',
      dataIndex: 'metadata',
      key: 'metadata',
      render: (metadata) => {
        if (!metadata || Object.keys(metadata).length === 0) {
          return '-';
        }
        // 简单展示 metadata 的 JSON 字符串，可以根据需要进行更友好的展示
        return <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{JSON.stringify(metadata, null, 2)}</pre>;
      },
    },
  ];

  return (
    <Modal
      title="账户收支明细"
      visible={visible}
      onCancel={onCancel}
      footer={null} // 不显示默认的确定和取消按钮
      width={1200} // 设置 Modal 宽度
      destroyOnClose // 关闭时销毁 Modal 内容，避免数据缓存问题
    >
      <Table
        columns={columns}
        dataSource={items}
        rowKey="id"
        loading={loading}
        pagination={{
          current: currentPage,
          pageSize: pageSize,
          total: total,
          onChange: onPageChange,
          showSizeChanger: true, // 允许用户改变每页显示条数
          pageSizeOptions: ['10', '20', '50', '100'], // 可选的每页显示条数
        }}
        scroll={{ x: 'max-content' }} // 水平滚动
      />
    </Modal>
  );
};

export default AccountStatementModal;