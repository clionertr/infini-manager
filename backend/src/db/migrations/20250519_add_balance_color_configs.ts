/**
 * 添加 red_packet_balance_color_ranges 和 available_balance_color_ranges 配置项到 user_configs 表
 */
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 配置项 1: red_packet_balance_color_ranges
  const redPacketConfigKey = 'red_packet_balance_color_ranges';
  const redPacketConfigExists = await knex('user_configs')
    .where({ key: redPacketConfigKey })
    .first();

  if (!redPacketConfigExists) {
    await knex('user_configs').insert({
      key: redPacketConfigKey,
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

  // 配置项 2: available_balance_color_ranges
  const availableBalanceConfigKey = 'available_balance_color_ranges';
  const availableBalanceConfigExists = await knex('user_configs')
    .where({ key: availableBalanceConfigKey })
    .first();

  if (!availableBalanceConfigExists) {
    await knex('user_configs').insert({
      key: availableBalanceConfigKey,
      value: JSON.stringify([
        {"threshold": 1000, "color": "green", "backgroundColor": "#389e0d", "textColor": "white"},
        {"threshold": 500, "color": "blue", "backgroundColor": "#1677ff", "textColor": "white"},
        {"threshold": 100, "color": "orange", "backgroundColor": "#faad14", "textColor": "black"},
        {"threshold": 10, "color": "red", "backgroundColor": "#f5222d", "textColor": "white"},
        {"threshold": 0, "color": "default", "backgroundColor": "#f0f0f0", "textColor": "black"}
      ]),
      description: '可用余额在前端显示的颜色范围配置',
      created_at: new Date(),
      updated_at: new Date()
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  // 我们通常不希望在回滚时删除默认配置
  // 如果需要，可以添加删除这两个key的逻辑，但通常保留它们是安全的
  return Promise.resolve();
}