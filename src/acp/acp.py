# ACP - Agent Communication Protocol for Bailongma
# Message routing, agent discovery, and inter-agent communication

import json
import uuid
import asyncio
from typing import Optional, Any
from datetime import datetime
from enum import Enum

class MessageType(Enum):
    REQUEST = "request"
    RESPONSE = "response"
    EVENT = "event"
    BROADCAST = "broadcast"
    ERROR = "error"

class ACPMessage:
    \"\"\"Agent Communication Protocol message.\"\"\"
    
    def __init__(self, msg_type: MessageType, sender: str, receiver: str,
                 content: Any, correlation_id: str = None):
        self.id = str(uuid.uuid4())
        self.type = msg_type
        self.sender = sender
        self.receiver = receiver
        self.content = content
        self.correlation_id = correlation_id or self.id
        self.timestamp = datetime.now().isoformat()
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "type": self.type.value,
            "sender": self.sender,
            "receiver": self.receiver,
            "content": self.content,
            "correlation_id": self.correlation_id,
            "timestamp": self.timestamp
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> "ACPMessage":
        return cls(
            msg_type=MessageType(data["type"]),
            sender=data["sender"],
            receiver=data["receiver"],
            content=data["content"],
            correlation_id=data.get("correlation_id")
        )

class MessageRouter:
    \"\"\"Routes ACP messages between agents.\"\"\"
    
    def __init__(self):
        self.agents = {}
        self.handlers = {}
        self.message_queue = asyncio.Queue()
        self._running = False
    
    def register_agent(self, agent_id: str, capabilities: list = None) -> dict:
        \"\"\"Register an agent in the network.\"\"\"
        self.agents[agent_id] = {
            "id": agent_id,
            "capabilities": capabilities or [],
            "registered_at": datetime.now().isoformat(),
            "status": "online"
        }
        return {"status": "registered", "agent_id": agent_id}
    
    def unregister_agent(self, agent_id: str) -> dict:
        if agent_id in self.agents:
            del self.agents[agent_id]
            return {"status": "unregistered", "agent_id": agent_id}
        return {"error": f"Agent '{agent_id}' not found"}
    
    def add_handler(self, message_type: MessageType, handler):
        \"\"\"Add a message handler for a specific type.\"\"\"
        if message_type not in self.handlers:
            self.handlers[message_type] = []
        self.handlers[message_type].append(handler)
    
    async def send(self, message: ACPMessage) -> dict:
        \"\"\"Send a message to an agent.\"\"\"
        if message.receiver not in self.agents and message.receiver != "*":
            return {"error": f"Agent '{message.receiver}' not found"}
        await self.message_queue.put(message)
        return {"status": "queued", "message_id": message.id}
    
    async def broadcast(self, sender: str, content: Any) -> dict:
        \"\"\"Broadcast to all registered agents.\"\"\"
        msg = ACPMessage(MessageType.BROADCAST, sender, "*", content)
        await self.message_queue.put(msg)
        return {"status": "broadcast", "message_id": msg.id}
    
    async def process_messages(self):
        \"\"\"Process message queue continuously.\"\"\"
        self._running = True
        while self._running:
            try:
                message = await asyncio.wait_for(self.message_queue.get(), timeout=1.0)
                handlers = self.handlers.get(message.type, [])
                for handler in handlers:
                    await handler(message)
            except asyncio.TimeoutError:
                continue
    
    def discover_agents(self, capability: str = None) -> list:
        \"\"\"Discover agents by capability.\"\"\"
        if capability:
            return [a for a in self.agents.values() if capability in a["capabilities"]]
        return list(self.agents.values())
    
    def get_status(self) -> dict:
        return {
            "agents_online": len(self.agents),
            "handlers": {k.value: len(v) for k, v in self.handlers.items()},
            "queue_size": self.message_queue.qsize()
        }

message_router = MessageRouter()
