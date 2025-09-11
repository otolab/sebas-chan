#!/usr/bin/env python3
"""
データベーススキーマ定義
"""

import pyarrow as pa


def get_issues_schema(vector_dimension: int = 256) -> pa.Schema:
    """Issuesテーブルのスキーマを返す
    
    Args:
        vector_dimension: ベクトルの次元数（デフォルト: 256）
    
    Returns:
        Issuesテーブルのスキーマ
    """
    return pa.schema([
        pa.field("id", pa.string()),
        pa.field("title", pa.string()),
        pa.field("description", pa.string()),
        pa.field("status", pa.string()),
        pa.field("labels", pa.list_(pa.string())),
        pa.field("updates", pa.string()),  # JSON文字列として保存
        pa.field("relations", pa.string()),  # JSON文字列として保存
        pa.field("source_input_ids", pa.list_(pa.string())),
        pa.field("vector", pa.list_(pa.float32(), vector_dimension))  # ベクトル
    ])


def get_state_schema() -> pa.Schema:
    """State文書テーブルのスキーマを返す
    
    Returns:
        Stateテーブルのスキーマ
    """
    return pa.schema([
        pa.field("id", pa.string()),
        pa.field("content", pa.string()),
        pa.field("updated_at", pa.timestamp('ms'))
    ])


def get_pond_schema(vector_dimension: int = 256) -> pa.Schema:
    """Pondテーブルのスキーマを返す
    
    Args:
        vector_dimension: ベクトルの次元数（デフォルト: 256）
    
    Returns:
        Pondテーブルのスキーマ
    """
    return pa.schema([
        pa.field("id", pa.string()),
        pa.field("content", pa.string()),
        pa.field("source", pa.string()),
        pa.field("timestamp", pa.timestamp('ms')),
        pa.field("vector", pa.list_(pa.float32(), vector_dimension))  # ベクトル
    ])


# テーブル名の定義
ISSUES_TABLE = "issues"
STATE_TABLE = "state"
POND_TABLE = "pond"

# 全テーブルのリスト
ALL_TABLES = [ISSUES_TABLE, STATE_TABLE, POND_TABLE]


def validate_issue(issue_data: dict) -> None:
    """Issueデータのバリデーション
    
    Args:
        issue_data: 検証するIssueデータ
    
    Raises:
        ValueError: 必須フィールドが不足している場合
        TypeError: フィールドの型が不正な場合
    """
    # 必須フィールドの検証
    required_fields = ['id', 'title', 'description', 'status', 'labels', 'updates', 'relations', 'source_input_ids']
    missing_fields = [field for field in required_fields if field not in issue_data]
    
    if missing_fields:
        raise ValueError(f"Missing required fields: {', '.join(missing_fields)}")
    
    # フィールドの型検証
    if not isinstance(issue_data.get('title'), str):
        raise TypeError("Field 'title' must be a string")
    if not isinstance(issue_data.get('description'), str):
        raise TypeError("Field 'description' must be a string")
    if issue_data.get('status') not in ['open', 'closed']:
        raise ValueError("Field 'status' must be 'open' or 'closed'")
    if not isinstance(issue_data.get('labels'), list):
        raise TypeError("Field 'labels' must be a list")