#!/usr/bin/env python3
"""
Ruriモデルを事前にダウンロードするスクリプト
初回のテスト実行前に実行することで、テスト中のタイムアウトを防ぐ
"""

import sys
import os

def download_model(model_name=None):
    """指定されたモデルをダウンロード"""
    
    # モデル名が指定されていない場合は環境変数またはデフォルト
    if model_name is None:
        model_name = os.environ.get('RURI_MODEL', 'cl-nagoya/ruri-v3-30m')
    
    # モデル情報
    model_info = {
        'cl-nagoya/ruri-v3-310m': {
            'size': '~1.2GB',
            'dimension': 768,
            'description': 'Large model'
        },
        'cl-nagoya/ruri-v3-30m': {
            'size': '~120MB', 
            'dimension': 256,
            'description': 'Small model'
        }
    }
    
    if model_name not in model_info:
        print(f"✗ Unknown model: {model_name}")
        print(f"  Available models: {', '.join(model_info.keys())}")
        return False
    
    info = model_info[model_name]
    print(f"Downloading Ruri model: {model_name}")
    print(f"  Size: {info['size']}, Dimension: {info['dimension']}d")
    print(f"  Description: {info['description']}")
    
    try:
        from sentence_transformers import SentenceTransformer
        
        # モデルをダウンロードして初期化
        model = SentenceTransformer(model_name)
        
        # テスト用にエンコード
        test_text = "これはテストです"
        embeddings = model.encode(test_text)
        
        print(f"✓ Model downloaded successfully")
        print(f"  Actual dimension: {len(embeddings)}")
        print(f"  Test encoding successful")
        
        return True
    except ImportError:
        print("✗ sentence-transformers is not installed")
        print("  Run: uv add sentence-transformers")
        return False
    except Exception as e:
        print(f"✗ Failed to download model: {e}")
        return False

if __name__ == "__main__":
    # コマンドライン引数からモデル名を取得
    model_name = None
    for arg in sys.argv[1:]:
        if arg.startswith('--model='):
            model_name = arg.split('=', 1)[1]
            break
        elif not arg.startswith('-'):
            model_name = arg
            break
    
    success = download_model(model_name)
    sys.exit(0 if success else 1)