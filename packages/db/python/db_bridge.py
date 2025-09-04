#!/usr/bin/env python3
"""
DB Bridge - LanceDB interface for sebas-chan
Provides JSON-RPC server for TypeScript to communicate with LanceDB
"""

import json
import sys
import os
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime
import asyncio

import lancedb
import pyarrow as pa
import pandas as pd
import numpy as np
from pydantic import BaseModel, Field

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class RPCRequest(BaseModel):
    """JSON-RPC 2.0 Request"""
    jsonrpc: str = "2.0"
    method: str
    params: Optional[Dict[str, Any]] = None
    id: Optional[int] = None


class RPCResponse(BaseModel):
    """JSON-RPC 2.0 Response"""
    jsonrpc: str = "2.0"
    result: Optional[Any] = None
    error: Optional[Dict[str, Any]] = None
    id: Optional[int] = None


class DBBridge:
    """LanceDB bridge for sebas-chan"""
    
    def __init__(self, db_path: str = "./data/lancedb"):
        """Initialize DB Bridge with LanceDB connection"""
        self.db_path = db_path
        self.db = None
        self.tables = {}
        self._initialize_db()
    
    def _initialize_db(self):
        """Initialize LanceDB connection and create tables if needed"""
        try:
            # Create directory if it doesn't exist
            os.makedirs(self.db_path, exist_ok=True)
            
            # Connect to LanceDB
            self.db = lancedb.connect(self.db_path)
            logger.info(f"Connected to LanceDB at {self.db_path}")
            
            # Initialize tables
            self._initialize_tables()
            
        except Exception as e:
            logger.error(f"Failed to initialize DB: {e}")
            raise
    
    def _initialize_tables(self):
        """Initialize required tables with schemas"""
        
        # Issues table schema
        issues_schema = pa.schema([
            pa.field("id", pa.string()),
            pa.field("title", pa.string()),
            pa.field("description", pa.string()),
            pa.field("status", pa.string()),
            pa.field("labels", pa.list_(pa.string())),
            pa.field("created_at", pa.timestamp('ms')),
            pa.field("updated_at", pa.timestamp('ms')),
            pa.field("vector", pa.list_(pa.float32(), 384))  # Embedding vector
        ])
        
        # Flows table schema
        flows_schema = pa.schema([
            pa.field("id", pa.string()),
            pa.field("title", pa.string()),
            pa.field("description", pa.string()),
            pa.field("status", pa.string()),
            pa.field("priority_score", pa.float32()),
            pa.field("issue_ids", pa.list_(pa.string())),
            pa.field("created_at", pa.timestamp('ms')),
            pa.field("updated_at", pa.timestamp('ms'))
        ])
        
        # Knowledge table schema
        knowledge_schema = pa.schema([
            pa.field("id", pa.string()),
            pa.field("type", pa.string()),
            pa.field("content", pa.string()),
            pa.field("upvotes", pa.int32()),
            pa.field("downvotes", pa.int32()),
            pa.field("created_at", pa.timestamp('ms')),
            pa.field("vector", pa.list_(pa.float32(), 384))
        ])
        
        # Pond table schema (unstructured data)
        pond_schema = pa.schema([
            pa.field("id", pa.string()),
            pa.field("content", pa.string()),
            pa.field("source", pa.string()),
            pa.field("timestamp", pa.timestamp('ms')),
            pa.field("vector", pa.list_(pa.float32(), 384))
        ])
        
        # Create or get tables
        table_configs = {
            "issues": issues_schema,
            "flows": flows_schema,
            "knowledge": knowledge_schema,
            "pond": pond_schema
        }
        
        for table_name, schema in table_configs.items():
            try:
                # Check if table exists
                if table_name in self.db.table_names():
                    self.tables[table_name] = self.db.open_table(table_name)
                    logger.info(f"Opened existing table: {table_name}")
                else:
                    # Create new table with empty data
                    empty_df = pd.DataFrame(columns=[field.name for field in schema])
                    self.tables[table_name] = self.db.create_table(
                        table_name, 
                        data=empty_df,
                        schema=schema
                    )
                    logger.info(f"Created new table: {table_name}")
            except Exception as e:
                logger.error(f"Error with table {table_name}: {e}")
    
    # RPC Methods
    
    async def create_issue(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new issue"""
        try:
            issue_data = params.get("issue", {})
            
            # Generate embedding (placeholder - would use real embedding model)
            vector = np.random.randn(384).tolist()
            
            # Prepare data
            data = {
                "id": issue_data.get("id"),
                "title": issue_data.get("title"),
                "description": issue_data.get("description"),
                "status": issue_data.get("status", "open"),
                "labels": issue_data.get("labels", []),
                "created_at": pd.Timestamp.now(),
                "updated_at": pd.Timestamp.now(),
                "vector": vector
            }
            
            # Insert into table
            self.tables["issues"].add([data])
            
            return {"success": True, "id": data["id"]}
            
        except Exception as e:
            logger.error(f"Failed to create issue: {e}")
            raise
    
    async def get_issue(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Get an issue by ID"""
        try:
            issue_id = params.get("id")
            
            # Query table
            results = self.tables["issues"].search().where(f"id = '{issue_id}'").limit(1).to_pandas()
            
            if len(results) == 0:
                return {"error": "Issue not found"}
            
            # Convert to dict and handle timestamps
            issue = results.iloc[0].to_dict()
            issue["created_at"] = issue["created_at"].isoformat() if pd.notna(issue["created_at"]) else None
            issue["updated_at"] = issue["updated_at"].isoformat() if pd.notna(issue["updated_at"]) else None
            
            return {"issue": issue}
            
        except Exception as e:
            logger.error(f"Failed to get issue: {e}")
            raise
    
    async def search_similar(self, params: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Search for similar items using vector similarity"""
        try:
            query_text = params.get("query")
            table_name = params.get("table", "issues")
            limit = params.get("limit", 10)
            
            # Generate query embedding (placeholder)
            query_vector = np.random.randn(384).tolist()
            
            # Perform vector search
            results = self.tables[table_name].search(query_vector).limit(limit).to_pandas()
            
            # Convert results
            items = []
            for _, row in results.iterrows():
                item = row.to_dict()
                # Handle timestamps
                if "created_at" in item:
                    item["created_at"] = item["created_at"].isoformat() if pd.notna(item["created_at"]) else None
                if "updated_at" in item:
                    item["updated_at"] = item["updated_at"].isoformat() if pd.notna(item["updated_at"]) else None
                # Remove vector from response
                item.pop("vector", None)
                items.append(item)
            
            return {"items": items}
            
        except Exception as e:
            logger.error(f"Failed to search similar: {e}")
            raise
    
    async def create_knowledge(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new knowledge entry"""
        try:
            knowledge_data = params.get("knowledge", {})
            
            # Generate embedding
            vector = np.random.randn(384).tolist()
            
            # Prepare data
            data = {
                "id": knowledge_data.get("id"),
                "type": knowledge_data.get("type"),
                "content": knowledge_data.get("content"),
                "upvotes": knowledge_data.get("upvotes", 0),
                "downvotes": knowledge_data.get("downvotes", 0),
                "created_at": pd.Timestamp.now(),
                "vector": vector
            }
            
            # Insert into table
            self.tables["knowledge"].add([data])
            
            return {"success": True, "id": data["id"]}
            
        except Exception as e:
            logger.error(f"Failed to create knowledge: {e}")
            raise
    
    async def add_to_pond(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Add unstructured data to the pond"""
        try:
            pond_data = params.get("entry", {})
            
            # Generate embedding
            vector = np.random.randn(384).tolist()
            
            # Prepare data
            data = {
                "id": pond_data.get("id"),
                "content": pond_data.get("content"),
                "source": pond_data.get("source"),
                "timestamp": pd.Timestamp.now(),
                "vector": vector
            }
            
            # Insert into table
            self.tables["pond"].add([data])
            
            return {"success": True, "id": data["id"]}
            
        except Exception as e:
            logger.error(f"Failed to add to pond: {e}")
            raise
    
    async def handle_request(self, request: RPCRequest) -> RPCResponse:
        """Handle JSON-RPC request"""
        try:
            # Map method names to handlers
            handlers = {
                "create_issue": self.create_issue,
                "get_issue": self.get_issue,
                "search_similar": self.search_similar,
                "create_knowledge": self.create_knowledge,
                "add_to_pond": self.add_to_pond,
            }
            
            handler = handlers.get(request.method)
            if not handler:
                return RPCResponse(
                    error={"code": -32601, "message": "Method not found"},
                    id=request.id
                )
            
            # Execute handler
            result = await handler(request.params or {})
            
            return RPCResponse(result=result, id=request.id)
            
        except Exception as e:
            logger.error(f"Request handling error: {e}")
            return RPCResponse(
                error={"code": -32603, "message": str(e)},
                id=request.id
            )


async def main():
    """Main loop for JSON-RPC server via stdio"""
    bridge = DBBridge()
    logger.info("DB Bridge started, waiting for requests...")
    
    while True:
        try:
            # Read line from stdin
            line = sys.stdin.readline()
            if not line:
                break
            
            # Parse JSON-RPC request
            try:
                request_data = json.loads(line.strip())
                request = RPCRequest(**request_data)
            except (json.JSONDecodeError, Exception) as e:
                response = RPCResponse(
                    error={"code": -32700, "message": "Parse error"},
                    id=None
                )
                print(json.dumps(response.dict()))
                sys.stdout.flush()
                continue
            
            # Handle request
            response = await bridge.handle_request(request)
            
            # Send response
            print(json.dumps(response.dict()))
            sys.stdout.flush()
            
        except KeyboardInterrupt:
            logger.info("Shutting down DB Bridge...")
            break
        except Exception as e:
            logger.error(f"Unexpected error: {e}")
            

if __name__ == "__main__":
    asyncio.run(main())