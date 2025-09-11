#!/usr/bin/env python3
"""
日本語特化の埋め込みモデルを提供するモジュール
複数のRuriモデルバリアントをサポート
"""

import os
import sys
from typing import List, Optional
import numpy as np


class EmbeddingModel:
    """Embedding model base class"""
    def encode(self, text: str, dimension: int = None) -> List[float]:
        raise NotImplementedError
    
    @property
    def dimension(self) -> int:
        """モデルの出力次元数"""
        raise NotImplementedError


class RuriEmbedding(EmbeddingModel):
    """Japanese-optimized Ruri model with configurable variants"""
    
    # サポートされるモデルの設定
    MODEL_CONFIGS = {
        'cl-nagoya/ruri-v3-310m': {
            'dimension': 768,
            'description': 'Large model (1.2GB, 768d)',
            'memory': '~1.2GB'
        },
        'cl-nagoya/ruri-v3-30m': {
            'dimension': 256,
            'description': 'Small model (120MB, 256d)',
            'memory': '~120MB'
        }
    }
    
    def __init__(self, model_name: str = None):
        """
        初期化
        
        Args:
            model_name: 使用するモデル名。Noneの場合は環境変数RURI_MODELから取得
        
        環境変数:
            RURI_MODEL: 使用するモデル名 (デフォルト: cl-nagoya/ruri-v3-30m)
            SKIP_MODEL_LOAD: テスト用にモデルロードをスキップ
        """
        # テスト環境でモデルロードをスキップ
        if os.environ.get('SKIP_MODEL_LOAD') == 'true':
            sys.stderr.write("Skipping model load for testing\n")
            self.available = False
            self._dimension = 256
            self.model = None
            return
            
        try:
            from sentence_transformers import SentenceTransformer
            
            # モデル名が指定されない場合は30mを使用
            if model_name is None:
                model_name = 'cl-nagoya/ruri-v3-30m'
            
            # モデル設定を取得
            if model_name not in self.MODEL_CONFIGS:
                sys.stderr.write(f"Warning: Unknown model {model_name}, using ruri-v3-30m\n")
                model_name = 'cl-nagoya/ruri-v3-30m'
            
            config = self.MODEL_CONFIGS[model_name]
            self.model_name = model_name
            self._dimension = config['dimension']
            
            # モデルをロード
            self.model = SentenceTransformer(model_name)
            self.available = True
            sys.stderr.write(f"Ruri model loaded: {model_name} - {config['description']}\n")
            
        except (ImportError, Exception) as e:
            sys.stderr.write(f"Warning: Could not load Ruri model: {e}\n")
            self.available = False
            self._dimension = 256  # デフォルトは小さい方
            self.model = None
    
    @property
    def dimension(self) -> int:
        """モデルの出力次元数"""
        return self._dimension
    
    def encode(self, text: str, dimension: int = None) -> List[float]:
        """
        テキストをベクトル化
        
        Args:
            text: ベクトル化するテキスト
            dimension: 出力次元数（Noneの場合はモデルのデフォルト）
        
        Returns:
            ベクトル表現
        """
        if dimension is None:
            dimension = self._dimension
            
        if not self.available:
            # モデルが利用できない場合はダミーベクトルを返す
            return [0.0] * dimension
            
        embeddings = self.model.encode(text)
        
        # 次元調整
        embeddings = self._adjust_dimension(embeddings, dimension)
        return embeddings.tolist()
    
    def _adjust_dimension(self, embeddings: np.ndarray, target_dim: int) -> np.ndarray:
        """
        ベクトルの次元を調整
        
        Args:
            embeddings: 元のベクトル
            target_dim: 目標次元数
        
        Returns:
            調整後のベクトル
        """
        current_dim = len(embeddings)
        
        if current_dim == target_dim:
            return embeddings
        
        elif current_dim > target_dim:
            # MRLを利用した次元削減
            embeddings = embeddings[:target_dim]
            # L2正規化
            norm = np.linalg.norm(embeddings)
            if norm > 0:
                embeddings = embeddings / norm
        
        else:
            # 次元が少ない場合はゼロパディング
            padding = [0.0] * (target_dim - current_dim)
            embeddings = np.concatenate([embeddings, padding])
        
        return embeddings
    
    @classmethod
    def get_available_models(cls) -> dict:
        """利用可能なモデルのリストを返す"""
        return cls.MODEL_CONFIGS.copy()


def create_embedding_model(model_name: str = None) -> EmbeddingModel:
    """
    埋め込みモデルのファクトリ関数
    
    Args:
        model_name: 使用するモデル名
    
    Returns:
        埋め込みモデルのインスタンス
    """
    return RuriEmbedding(model_name)