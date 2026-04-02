# ===============================================================
# TRADE_HANDLER.PY - Trade Execution & Position Management
# ===============================================================

import json
from datetime import datetime
from connector import connector


class TradeHandler:
    """Handles trade execution commands and sends responses to frontend"""

    # ==================== TRADE EXECUTION ====================

    async def handle_trade_command(self, message: str, websocket):
        """Handle TRADE_BUY_EURUSD_0.01_1.0850_SL_TP format"""
        try:
            parts = message.split("_")

            # ✅ Minimum 5 parts: TRADE_BUY_EURUSD_0.01_1.0850
            # ✅ Optional: TRADE_BUY_EURUSD_0.01_1.0850_1.0800_1.0900 (with sl/tp)
            if len(parts) < 5:
                await self.send_trade_response(websocket, False,
                    "Invalid format. Use: TRADE_BUY_EURUSD_0.01_1.0850")
                return

            direction = parts[1]
            symbol    = parts[2]
            volume    = float(parts[3])
            price     = float(parts[4])

            # ✅ sl first, tp second — matches connection-manager order
            sl = float(parts[5]) if len(parts) > 5 and parts[5] not in ('0', 'None', '') else None
            tp = float(parts[6]) if len(parts) > 6 and parts[6] not in ('0', 'None', '') else None

            if not connector.connected:
                await self.send_trade_response(websocket, False, "Not connected to MT5")
                return

            trade_result = connector.execute_trade(symbol, direction, volume, price, tp=tp, sl=sl)

            if trade_result.get('success'):
                await websocket.send(json.dumps({
                    'type':      'trade_executed',
                    'success':   True,
                    'direction': direction,
                    'symbol':    symbol,
                    'volume':    volume,
                    'price':     trade_result.get('price', price), # ✅ MT5 actual execution price
                    'tp':        tp,
                    'sl':        sl,
                    'ticket':    trade_result.get('ticket'),
                    'timestamp': trade_result.get('timestamp'),    # ✅ MT5 execution timestamp
                    'message':   trade_result.get('message', 'Trade executed')
                }))
            else:
                await self.send_trade_response(
                    websocket, False, trade_result.get('error', 'Trade execution failed')
                )

        except ValueError as e:
            await self.send_trade_response(websocket, False, f"Invalid number: {str(e)}")
        except Exception as e:
            await self.send_trade_response(websocket, False, f"Trade error: {str(e)}")

    async def send_trade_response(self, websocket, success: bool, message: str):
        """Send trade execution response"""
        await websocket.send(json.dumps({
            'type':    'trade_executed',
            'success': success,
            'message': message
        }))

    # ==================== POSITION MANAGEMENT ====================

    async def handle_close_position(self, ticket: str, websocket):
        """Close a specific position by ticket"""
        try:
            if not connector.connected:
                await websocket.send(json.dumps({
                    'type':    'position_closed',
                    'success': False,
                    'message': 'Not connected to MT5'
                }))
                return

            close_result = connector.close_position(ticket)

            if close_result.get('success'):
                await websocket.send(json.dumps({
                    'type':    'position_closed',
                    'success': True,
                    'ticket':  ticket,
                    'message': close_result.get('message', 'Position closed')
                }))
            else:
                await websocket.send(json.dumps({
                    'type':    'position_closed',
                    'success': False,
                    'message': close_result.get('error', 'Failed to close position')
                }))

        except Exception as e:
            await websocket.send(json.dumps({
                'type':    'position_closed',
                'success': False,
                'message': f'Close position error: {str(e)}'
            }))

    async def handle_close_all(self, websocket):
        """Close all open positions"""
        try:
            if not connector.connected:
                await websocket.send(json.dumps({
                    'type':    'positions_closed',
                    'success': False,
                    'message': 'Not connected to MT5'
                }))
                return

            close_result = connector.close_all_positions()

            if close_result.get('success'):
                await websocket.send(json.dumps({
                    'type':    'positions_closed',
                    'success': True,
                    'message': close_result.get('message', 'All positions closed'),
                    'details': close_result.get('details', {})
                }))
            else:
                await websocket.send(json.dumps({
                    'type':    'positions_closed',
                    'success': False,
                    'message': close_result.get('error', 'Failed to close positions')
                }))

        except Exception as e:
            await websocket.send(json.dumps({
                'type':    'positions_closed',
                'success': False,
                'message': f'Close all error: {str(e)}'
            }))

    # ==================== MODIFY POSITION ====================

    async def handle_modify_position(self, message: str, websocket):
        """Handle MODIFY_POSITION_ticket_sl_tp format"""
        try:
            parts = message.split("_")

            # ✅ MODIFY_POSITION_ticket_sl_tp = 5 parts
            if len(parts) < 5:
                await websocket.send(json.dumps({
                    'type':    'position_modified',
                    'success': False,
                    'message': 'Invalid format. Use: MODIFY_POSITION_ticket_sl_tp'
                }))
                return

            ticket = int(parts[2])
            sl     = float(parts[3]) if parts[3] not in ('0', 'None', '') else None
            tp     = float(parts[4]) if parts[4] not in ('0', 'None', '') else None

            if not connector.connected:
                await websocket.send(json.dumps({
                    'type':    'position_modified',
                    'success': False,
                    'message': 'Not connected to MT5'
                }))
                return

            modify_result = connector.modify_position(ticket, sl=sl, tp=tp)

            await websocket.send(json.dumps({
                'type':    'position_modified',
                'success': modify_result.get('success'),
                'ticket':  ticket,
                'message': modify_result.get('message') or modify_result.get('error', 'Failed')
            }))

        except ValueError as e:
            await websocket.send(json.dumps({
                'type':    'position_modified',
                'success': False,
                'message': f'Invalid number: {str(e)}'
            }))
        except Exception as e:
            await websocket.send(json.dumps({
                'type':    'position_modified',
                'success': False,
                'message': f'Modify error: {str(e)}'
            }))

    # ==================== AUTO-TRADING RESPONSES ====================

    async def handle_auto_trade_on(self, websocket):
        """Send auto trading enabled confirmation to frontend"""
        await websocket.send(json.dumps({
            'type':    'auto_trading_status',
            'enabled': True,
            'message': 'Auto trading enabled'
        }))

    async def handle_auto_trade_off(self, websocket):
        """Send auto trading disabled confirmation to frontend"""
        await websocket.send(json.dumps({
            'type':    'auto_trading_status',
            'enabled': False,
            'message': 'Auto trading disabled'
        }))


# ===============================================================
# GLOBAL INSTANCE
# ===============================================================

trade_handler = TradeHandler()