/**
 * 批量转账服务
 * 用于处理批量转账的业务逻辑
 */
import db from '../db/db';
import { ApiResponse } from '../types';
import { InfiniAccountService } from './InfiniAccountService';

// 创建InfiniAccountService实例
const infiniAccountService = new InfiniAccountService();

// 批量转账创建数据接口
interface BatchTransferCreateData {
  name: string;
  type: 'one_to_many' | 'many_to_one';
  sourceAccountId?: number | string;
  targetAccountId?: number | string;
  relations: Array<{
    sourceAccountId?: number | string;
    targetAccountId?: number | string;
    contactType?: 'uid' | 'email' | 'inner';
    targetIdentifier?: string;
    amount: string;
  }>;
  remarks?: string;
  createdBy?: number | string | null;
}

// 批量转账关系接口
interface BatchTransferRelation {
  id: number;
  batch_id: number;
  source_account_id: number | null;
  target_account_id: number | null;
  contact_type: string | null;
  target_identifier: string | null;
  amount: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  transfer_id: number | null;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
}

export class BatchTransferService {
  /**
   * 创建批量转账
   * @param data 批量转账创建数据
   * @returns 创建结果
   */
  async createBatchTransfer(data: BatchTransferCreateData): Promise<ApiResponse> {
    try {
      // 检查重复的目标账户（一对多模式）
      if (data.type === 'one_to_many') {
        const targetIdentifiers = data.relations.map(r => r.targetIdentifier);
        const uniqueTargets = new Set(targetIdentifiers);
        
        if (uniqueTargets.size !== targetIdentifiers.length) {
          return {
            success: false,
            message: '一对多模式下不允许对同一目标账户多次转账',
            data: {
              duplicates: this.findDuplicates(targetIdentifiers)
            }
          };
        }
      }
      
      // 检查重复的源账户（多对一模式）
      if (data.type === 'many_to_one') {
        const sourceAccountIds = data.relations.map(r => r.sourceAccountId);
        const uniqueSources = new Set(sourceAccountIds);
        
        if (uniqueSources.size !== sourceAccountIds.length) {
          return {
            success: false,
            message: '多对一模式下不允许从同一源账户多次转账',
            data: {
              duplicates: this.findDuplicates(sourceAccountIds)
            }
          };
        }
      }
      
      // 计算总金额
      const totalAmount = data.relations.reduce((sum, r) => {
        const amount = parseFloat(r.amount);
        return sum + (isNaN(amount) ? 0 : amount);
      }, 0).toString();
      
      // 开始数据库事务
      const trx = await db.transaction();
      
      try {
        // 生成批次编号
        const batchNumber = `BT${Date.now()}`;
        
        // 创建批量转账记录 - 调整字段名以匹配数据库表结构
        const [batchId] = await trx('infini_batch_transfers').insert({
          name: data.name, // 现在已添加name字段
          batch_number: batchNumber,
          batch_type: data.type, // 数据库中是batch_type而非type
          status: 'pending',
          total_accounts: data.relations.length,
          total_amount: totalAmount,
          // 使用error_message代替remarks，因为实际表中没有remarks字段
          error_message: data.remarks || data.name || null,
          created_by: data.createdBy || null,
          created_at: new Date(),
          updated_at: new Date()
        });
        
        // 创建转账关系记录
        const relationRecords = data.relations.map(relation => {
          // 一对多模式：使用指定的源账户ID
          if (data.type === 'one_to_many') {
            return {
              batch_id: batchId,
              source_account_id: data.sourceAccountId,
              target_account_id: relation.targetAccountId,
              contact_type: relation.contactType || 'inner',
              target_identifier: relation.targetIdentifier,
              amount: relation.amount,
              status: 'pending',
              created_at: new Date(),
              updated_at: new Date()
            };
          }
          // 多对一模式：使用指定的目标账户ID
          else {
            return {
              batch_id: batchId,
              source_account_id: relation.sourceAccountId,
              target_account_id: data.targetAccountId,
              contact_type: relation.contactType || 'inner',
              target_identifier: relation.targetIdentifier,
              amount: relation.amount,
              status: 'pending',
              created_at: new Date(),
              updated_at: new Date()
            };
          }
        });
        
        await trx('infini_batch_transfer_relations').insert(relationRecords);
        
        // 添加历史记录
        await trx('infini_batch_transfer_histories').insert({
          batch_id: batchId,
          status: 'pending',
          message: '批量转账已创建',
          details: JSON.stringify({
            type: data.type,
            totalAmount,
            relationsCount: data.relations.length
          }),
          created_at: new Date()
        });
        
        // 提交事务
        await trx.commit();
        
        return {
          success: true,
          data: {
            batchId,
            totalAmount,
            relationsCount: data.relations.length
          },
          message: '批量转账已创建'
        };
      } catch (error) {
        // 回滚事务
        await trx.rollback();
        throw error;
      }
    } catch (error) {
      console.error('创建批量转账失败:', error);
      return {
        success: false,
        message: `创建批量转账失败: ${(error as Error).message}`
      };
    }
  }
  
  /**
   * 执行批量转账
   * @param batchId 批量转账ID
   * @param auto2FA 是否自动处理2FA验证
   * @returns 执行结果
   */
  async executeBatchTransfer(batchId: number, auto2FA: boolean = false): Promise<ApiResponse> {
    try {
      // 获取批量转账信息
      const batch = await db('infini_batch_transfers').where('id', batchId).first();
      if (!batch) {
        return {
          success: false,
          message: '找不到指定的批量转账'
        };
      }
      
      // 更新状态为处理中
      await this.updateBatchStatus(batchId, 'processing');
      
      // 获取所有待处理的转账关系
      const relations = await db('infini_batch_transfer_relations')
        .where('batch_id', batchId)
        .where('status', 'pending')
        .orderBy('id', 'asc');
      
      if (relations.length === 0) {
        return {
          success: true,
          message: '没有待处理的转账关系',
          data: { batchId }
        };
      }
      
      // 处理每个转账关系
      let successCount = 0;
      let failedCount = 0;
      
      for (const relation of relations) {
        try {
          // 更新关系状态为processing
          await this.updateRelationStatus(relation.id, 'processing');
          
          // 执行转账
          const result = await this.processTransfer(relation, auto2FA);
          
          // 更新关系状态
          if (result) {
            await this.updateRelationStatus(relation.id, 'completed');
            successCount++;
          } else {
            await this.updateRelationStatus(relation.id, 'failed', '转账失败');
            failedCount++;
          }
        } catch (error) {
          // 更新关系状态为failed
          await this.updateRelationStatus(
            relation.id, 
            'failed', 
            (error as Error).message || '转账处理异常'
          );
          failedCount++;
        }
      }
      
      // 更新批量转账状态和计数
      const finalStatus = failedCount === 0 ? 'completed' : (successCount === 0 ? 'failed' : 'completed');
      await db('infini_batch_transfers')
        .where('id', batchId)
        .update({
          status: finalStatus,
          success_count: successCount,
          fail_count: failedCount, // 修正字段名：failed_count -> fail_count
          end_time: new Date(), // 使用end_time代替completed_at
          updated_at: new Date()
        });
      
      // 添加历史记录
      await db('infini_batch_transfer_histories').insert({
        batch_id: batchId,
        status: finalStatus,
        message: `批量转账已完成，成功: ${successCount}，失败: ${failedCount}`,
        created_at: new Date()
      });
      
      return {
        success: true,
        data: {
          batchId,
          successCount,
          failedCount,
          status: finalStatus
        },
        message: `批量转账已完成，成功: ${successCount}，失败: ${failedCount}`
      };
    } catch (error) {
      console.error('执行批量转账失败:', error);
      return {
        success: false,
        message: `执行批量转账失败: ${(error as Error).message}`,
        data: { batchId }
      };
    }
  }
  
  /**
   * 处理单笔转账
   * @param relation 转账关系
   * @param auto2FA 是否自动处理2FA验证
   * @returns 是否成功
   */
  async processTransfer(relation: BatchTransferRelation, auto2FA: boolean = false): Promise<boolean> {
    try {
      // 获取批量转账信息
      const batch = await db('infini_batch_transfers')
        .where('id', relation.batch_id)
        .first();
      
      if (!batch) {
        throw new Error('找不到关联的批量转账');
      }
      
      // 根据批量转账类型确定源账户和目标账户
      let sourceAccountId: string;
      let contactType: 'uid' | 'email' | 'inner';
      let targetIdentifier: string;
      
      if (batch.batch_type === 'one_to_many') { // 修正字段名：type -> batch_type
        // 一对多模式：源账户固定，目标账户来自关系
        if (!relation.source_account_id) {
          throw new Error('缺少源账户ID');
        }
        
        sourceAccountId = relation.source_account_id.toString();
        contactType = (relation.contact_type || 'inner') as 'uid' | 'email' | 'inner';
        targetIdentifier = relation.target_identifier || '';
      } else { // 多对一模式
        // 多对一模式：源账户来自关系，目标账户固定
        if (!relation.source_account_id) {
          throw new Error('缺少源账户ID');
        }
        
        sourceAccountId = relation.source_account_id.toString();
        
        // 使用关系中提供的contactType和targetIdentifier，支持外部账户转账
        contactType = (relation.contact_type || 'inner') as 'uid' | 'email' | 'inner';
        targetIdentifier = relation.target_identifier || '';
        
        // 如果没有提供targetIdentifier但提供了target_account_id，使用内部账户转账
        if ((!targetIdentifier || targetIdentifier === '') && relation.target_account_id) {
          contactType = 'inner';
          targetIdentifier = relation.target_account_id.toString();
        }
      }
      
      // 调用InfiniAccountService执行转账
      const response = await infiniAccountService.internalTransfer(
        sourceAccountId,
        contactType,
        targetIdentifier,
        relation.amount,
        'batch', // 来源为批量转账
        false, // 不强制执行
        batch.error_message || undefined, // 使用error_message代替remarks
        auto2FA // 是否自动处理2FA验证
      );
      
      // 如果转账成功，更新关系的transfer_id
      if (response.success && response.data && response.data.transferId) {
        await db('infini_batch_transfer_relations')
          .where('id', relation.id)
          .update({
            transfer_id: response.data.transferId,
            updated_at: new Date()
          });
      } else if (!response.success) {
        // 如果转账失败，记录错误信息
        await db('infini_batch_transfer_relations')
          .where('id', relation.id)
          .update({
            error_message: response.message || '转账失败',
            updated_at: new Date()
          });
      }
      
      return response.success;
    } catch (error) {
      console.error('处理单笔转账失败:', error);
      
      // 记录错误信息
      await db('infini_batch_transfer_relations')
        .where('id', relation.id)
        .update({
          error_message: (error as Error).message || '转账处理异常',
          updated_at: new Date()
        });
      
      return false;
    }
  }
  
  /**
   * 恢复批量转账
   * @param batchId 批量转账ID
   * @param auto2FA 是否自动处理2FA验证
   * @returns 恢复结果
   */
  async resumeBatchTransfer(batchId: number, auto2FA: boolean = false): Promise<ApiResponse> {
    try {
      // 查找所有pending状态的转账关系
      const pendingRelations = await db('infini_batch_transfer_relations')
        .where('batch_id', batchId)
        .where('status', 'pending')
        .select('*');
      
      if (pendingRelations.length === 0) {
        // 如果没有pending状态的转账，检查是否所有转账都已完成
        const allCompleted = await this.checkAllRelationsCompleted(batchId);
        
        if (allCompleted) {
          // 更新批量转账状态为completed
          await this.updateBatchStatus(batchId, 'completed');
          
          return {
            success: true,
            message: '所有转账已完成',
            data: { batchId }
          };
        } else {
          // 更新批量转账状态为failed
          await this.updateBatchStatus(batchId, 'failed');
          
          return {
            success: false,
            message: '批量转账失败',
            data: { batchId }
          };
        }
      }
      
      // 更新批量转账状态为processing
      await this.updateBatchStatus(batchId, 'processing');
      
      // 处理每个pending状态的转账关系
      let successCount = 0;
      let failedCount = 0;
      
      for (const relation of pendingRelations) {
        try {
          // 更新关系状态为processing
          await this.updateRelationStatus(relation.id, 'processing');
          
          // 执行转账
          const result = await this.processTransfer(relation, auto2FA);
          
          // 更新关系状态
          if (result) {
            await this.updateRelationStatus(relation.id, 'completed');
            successCount++;
          } else {
            await this.updateRelationStatus(relation.id, 'failed', '转账失败');
            failedCount++;
          }
        } catch (error) {
          // 更新关系状态为failed
          await this.updateRelationStatus(
            relation.id, 
            'failed', 
            (error as Error).message || '转账处理异常'
          );
          failedCount++;
        }
      }
      
      // 获取当前的成功和失败计数
      const currentCounts = await db('infini_batch_transfers')
        .where('id', batchId)
        .select('success_count', 'failed_count')
        .first();
      
      // 更新批量转账状态和计数
      const totalSuccessCount = (currentCounts?.success_count || 0) + successCount;
      const totalFailedCount = (currentCounts?.fail_count || 0) + failedCount; // 修正字段名：failed_count -> fail_count
      const finalStatus = await this.determineFinalStatus(batchId);
      
      await db('infini_batch_transfers')
        .where('id', batchId)
        .update({
          status: finalStatus,
          success_count: totalSuccessCount,
          fail_count: totalFailedCount, // 修正字段名：failed_count -> fail_count
          end_time: finalStatus === 'completed' || finalStatus === 'failed' ? new Date() : null, // 使用end_time代替completed_at
          updated_at: new Date()
        });
      
      // 添加历史记录
      await db('infini_batch_transfer_histories').insert({
        batch_id: batchId,
        status: finalStatus,
        message: `批量转账已恢复，本次成功: ${successCount}，本次失败: ${failedCount}，总成功: ${totalSuccessCount}，总失败: ${totalFailedCount}`,
        created_at: new Date()
      });
      
      return {
        success: true,
        data: {
          batchId,
          successCount: totalSuccessCount,
          failedCount: totalFailedCount,
          status: finalStatus
        },
        message: `批量转账已恢复，本次成功: ${successCount}，本次失败: ${failedCount}`
      };
    } catch (error) {
      console.error('恢复批量转账失败:', error);
      return {
        success: false,
        message: `恢复批量转账失败: ${(error as Error).message}`,
        data: { batchId }
      };
    }
  }
  
  /**
   * 处理单个转账关系
   * @param relationId 转账关系ID
   * @param auto2FA 是否自动处理2FA验证
   * @returns 处理结果
   */
  async processTransferRelation(relationId: number, auto2FA: boolean = false): Promise<ApiResponse> {
    try {
      // 获取转账关系
      const relation = await db('infini_batch_transfer_relations')
        .where('id', relationId)
        .first();
      
      if (!relation) {
        return {
          success: false,
          message: '找不到指定的转账关系'
        };
      }
      
      // 更新关系状态为processing
      await this.updateRelationStatus(relationId, 'processing');
      
      // 执行转账
      const result = await this.processTransfer(relation, auto2FA);
      
      // 更新关系状态
      if (result) {
        await this.updateRelationStatus(relationId, 'completed');
      } else {
        await this.updateRelationStatus(relationId, 'failed', '转账失败');
      }
      
      // 检查批量转账状态
      const batchId = relation.batch_id;
      const finalStatus = await this.determineFinalStatus(batchId);
      
      // 更新批量转账状态
      await this.updateBatchStatus(batchId, finalStatus);
      
      return {
        success: result,
        message: result ? '转账成功' : '转账失败',
        data: { relationId, batchId }
      };
    } catch (error) {
      console.error('处理单个转账关系失败:', error);
      return {
        success: false,
        message: `处理单个转账关系失败: ${(error as Error).message}`
      };
    }
  }
  
  /**
   * 更新转账关系状态
   * @param relationId 转账关系ID
   * @param status 状态
   * @param errorMessage 错误信息
   */
  private async updateRelationStatus(
    relationId: number, 
    status: 'pending' | 'processing' | 'completed' | 'failed',
    errorMessage?: string
  ): Promise<void> {
    const updateData: any = {
      status,
      updated_at: new Date()
    };
    
    if (status === 'failed' && errorMessage) {
      updateData.error_message = errorMessage;
    }
    
    await db('infini_batch_transfer_relations')
      .where('id', relationId)
      .update(updateData);
  }
  
  /**
   * 更新批量转账状态
   * @param batchId 批量转账ID
   * @param status 状态
   */
  private async updateBatchStatus(
    batchId: number,
    status: 'pending' | 'processing' | 'completed' | 'failed'
  ): Promise<void> {
    const updateData: any = {
      status,
      updated_at: new Date()
    };
    
    if (status === 'completed' || status === 'failed') {
      updateData.end_time = new Date(); // 使用end_time代替completed_at
    }
    
    await db('infini_batch_transfers')
      .where('id', batchId)
      .update(updateData);
  }
  
  /**
   * 确定批量转账的最终状态
   * @param batchId 批量转账ID
   * @returns 最终状态
   */
  private async determineFinalStatus(batchId: number): Promise<'pending' | 'processing' | 'completed' | 'failed'> {
    // 获取转账关系统计信息
    const totalCount = await db('infini_batch_transfer_relations')
      .where('batch_id', batchId)
      .count('id as count')
      .first()
      .then(result => (result as any).count);
    
    const pendingCount = await db('infini_batch_transfer_relations')
      .where('batch_id', batchId)
      .whereIn('status', ['pending', 'processing'])
      .count('id as count')
      .first()
      .then(result => (result as any).count);
    
    const failedCount = await db('infini_batch_transfer_relations')
      .where('batch_id', batchId)
      .where('status', 'failed')
      .count('id as count')
      .first()
      .then(result => (result as any).count);
    
    // 如果还有待处理的转账，状态为processing
    if (pendingCount > 0) {
      return 'processing';
    }
    
    // 如果所有转账都失败，状态为failed
    if (failedCount === totalCount) {
      return 'failed';
    }
    
    // 如果有部分成功，部分失败，状态为completed
    return 'completed';
  }
  
  /**
   * 检查是否所有转账关系都已完成
   * @param batchId 批量转账ID
   * @returns 是否所有转账都已完成
   */
  private async checkAllRelationsCompleted(batchId: number): Promise<boolean> {
    const pendingCount = await db('infini_batch_transfer_relations')
      .where('batch_id', batchId)
      .whereIn('status', ['pending', 'processing'])
      .count('id as count')
      .first()
      .then(result => (result as any).count);
    
    return pendingCount === 0;
  }
  
  /**
   * 查找重复项
   * @param array 数组
   * @returns 重复项数组
   */
  private findDuplicates(array: any[]): any[] {
    const counts: Record<string, number> = {};
    const duplicates: any[] = [];
    
    for (const item of array) {
      if (!item) continue;
      
      const key = item.toString();
      counts[key] = (counts[key] || 0) + 1;
      
      if (counts[key] > 1 && !duplicates.includes(item)) {
        duplicates.push(item);
      }
    }
    
    return duplicates;
  }
}