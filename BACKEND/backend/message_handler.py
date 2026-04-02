# ===============================================================
# MESSAGE_HANDLER.PY - Client Message Processing & Routing
# ===============================================================

import json
from datetime import datetime
from typing import Optional
from connector import connector
from chart_manager import chart_manager
from broadcast_manager import broadcast_manager
from trade_handler import trade_handler
from strategy_manager import strategy_manager


class MessageHandler:
    """Routes incoming WebSocket messages to appropriate handlers"""
    
    def __init__(self):
        pass
    
    # ==================== MAIN MESSAGE ROUTER ====================
    
    async def process_message(self, message: str, websocket):
        """Process incoming client message and route to handlers"""
        
        # ==================== PING/PONG ====================
        if message == "ping":
            await websocket.send("pong")
        
        # ==================== CHART SUBSCRIPTIONS ====================
        elif message.startswith("SUBSCRIBE_"):
            symbol, timeframe = self._parse_symbol_timeframe(message, "SUBSCRIBE_")
            if symbol and timeframe:
                await broadcast_manager.send_initial_data(websocket, symbol, timeframe)
            else:
                await websocket.send(json.dumps({
                    'type': 'error',
                    'message': 'Use SUBSCRIBE_SYMBOL_TIMEFRAME format'
                }))
        
        elif message.startswith("UNSUBSCRIBE_"):
            symbol = message.replace("UNSUBSCRIBE_", "")
            connector.clear_candle_cache(symbol)
            
            state = chart_manager.get_chart_state()
            if state['symbol'] == symbol:
                chart_manager.clear_chart_state()
                chart_manager.clear_candle_storage()
        
        elif message.startswith("GET_CANDLES_"):
            symbol, timeframe = self._parse_symbol_timeframe(message, "GET_CANDLES_")
            if symbol and timeframe:
                connector.clear_candle_cache(symbol, timeframe)
                await broadcast_manager.send_initial_data(websocket, symbol, timeframe)
        
        elif message == "INITIAL_DATA_RECEIVED":
            chart_manager.mark_chart_ready()
        
        # ==================== STRATEGY COMMANDS ====================
        elif (message.startswith("DEPLOY_STRATEGY_") or
              message.startswith("REMOVE_STRATEGY_") or
              message.startswith("UPDATE_STRATEGY_") or
              message.startswith("BACKTEST_STRATEGY_") or
              message == "GET_ACTIVE_STRATEGIES"):
            
            await self._handle_strategy_command(message, websocket)
        
        # ==================== TRADE COMMANDS ====================
        elif message.startswith("TRADE_"):
            await trade_handler.handle_trade_command(message, websocket)
        
        elif message == "CLOSE_ALL":
            await trade_handler.handle_close_all(websocket)
            await broadcast_manager.send_positions_update(websocket)
        
        elif message.startswith("CLOSE_POSITION_"):
            ticket = message.replace("CLOSE_POSITION_", "")
            await trade_handler.handle_close_position(ticket, websocket)
            await broadcast_manager.send_positions_update(websocket)

        # ✅ Modify position SL/TP
        elif message.startswith("MODIFY_POSITION_"):
            await trade_handler.handle_modify_position(message, websocket)
            await broadcast_manager.send_positions_update(websocket)
        
        # ==================== DATA REQUESTS ====================
        elif message == "GET_POSITIONS":
            await broadcast_manager.send_positions_update(websocket)
        
        elif message == "GET_ACCOUNT_INFO":
            await broadcast_manager.send_account_info(websocket)
        
        elif message == "GET_CURRENT_PRICE":
            await broadcast_manager.send_current_price(websocket)
        
        elif message == "GET_CONNECTION_STATUS":
            status = connector.check_mt5_connection()
            await websocket.send(json.dumps({
                'type': 'connection_status',
                'data': status,
                'timestamp': datetime.now().isoformat()
            }))
        
        # ==================== AUTO-TRADING CONTROL ====================
        elif message == "AUTO_ON":
            await trade_handler.handle_auto_trade_on(websocket)
            strategy_manager.set_auto_trading(True)
        
        elif message == "AUTO_OFF":
            await trade_handler.handle_auto_trade_off(websocket)
            strategy_manager.set_auto_trading(False)
        
        # ==================== CACHE MANAGEMENT ====================
        elif message == "CLEAR_CACHE":
            connector.clear_candle_cache()
            chart_manager.clear_candle_storage()
            await websocket.send(json.dumps({
                'type': 'cache_cleared',
                'message': 'Candle cache cleared'
            }))
        
        # ==================== UNKNOWN COMMAND ====================
        else:
            await websocket.send(json.dumps({
                'type': 'error',
                'message': f'Unknown command: {message}'
            }))
    
    # ==================== STRATEGY COMMAND HANDLER ====================
    
    async def _handle_strategy_command(self, message: str, websocket):
        """Route strategy commands to strategy_manager"""
        try:
            result = await strategy_manager.handle_raw_command(message)
            response = {
                'type': 'strategy_response',
                'command': message,
                'result': result,
                'timestamp': datetime.now().isoformat()
            }
            await websocket.send(json.dumps(response, default=str))
                
        except Exception as e:
            error_response = {
                'type': 'strategy_response',
                'command': message,
                'result': {'success': False, 'error': str(e)},
                'timestamp': datetime.now().isoformat()
            }
            await websocket.send(json.dumps(error_response, default=str))
    
    # ==================== HELPER METHODS ====================
    
    def _parse_symbol_timeframe(self, message: str, prefix: str):
        """Parse symbol and timeframe from message"""
        content = message.replace(prefix, "")
        parts = content.split("_")
        if len(parts) >= 2:
            return parts[0], parts[1]
        return None, None


# ===============================================================
# GLOBAL INSTANCE
# ===============================================================

message_handler = MessageHandler()