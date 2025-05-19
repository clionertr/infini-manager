/**
 * 添加 red_packet_balance_color_ranges 配置项到 user_configs 表
 */
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 检查 red_packet_balance_color_ranges 配置是否已存在
  const configExists = await knex('user_configs')
    .where({ key: 'red_packet_balance_color_ranges' })
    .first();

  if (!configExists) {
    // 添加红包余额颜色范围默认配置
    await knex('user_configs').insert({
      key: 'red_packet_balance_color_ranges',
      value: JSON.stringify([
        {"threshold": 100, "color": "green", "backgroundColor": "#52c41a", "textColor": "#ffffff"},
        {"threshold": 50, "color": "blue", "backgroundColor": "#1890ff", "textColor": "#ffffff"},
        {"threshold": 10, "color": "orange", "backgroundColor": "#fa8c16", "textColor": "#ffffff"},
        {"threshold": 0, "color": "red", "backgroundColor": "#f5222d", "textColor": "#ffffff"},
        {"threshold": -Infinity, "color": "default", "backgroundColor": "#d9d9d9", "textColor": "#000000"}
      ]),
      description: '红包余额在前端显示的颜色范围配置',
      created_at: new Date(),
      updated_at: new Date()
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  // 我们通常不希望在回滚时删除默认配置
  return Promise.resolve();
}