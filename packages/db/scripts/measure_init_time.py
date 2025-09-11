#!/usr/bin/env python3
"""
Ruriモデルの初期化時間を計測するスクリプト
"""

import time
import sys

def measure_model_init():
    print("Measuring Ruri model initialization time...")
    
    # インポート時間
    import_start = time.time()
    from sentence_transformers import SentenceTransformer
    import_time = time.time() - import_start
    print(f"  Import time: {import_time:.2f}s")
    
    # モデル初期化時間（キャッシュあり）
    init_start = time.time()
    model = SentenceTransformer('cl-nagoya/ruri-v3-310m')
    init_time = time.time() - init_start
    print(f"  Model init time (cached): {init_time:.2f}s")
    
    # エンコード時間
    encode_start = time.time()
    _ = model.encode("これはテストです")
    encode_time = time.time() - encode_start
    print(f"  First encode time: {encode_time:.2f}s")
    
    # 2回目のエンコード時間
    encode2_start = time.time()
    _ = model.encode("これは2回目のテストです")
    encode2_time = time.time() - encode2_start
    print(f"  Second encode time: {encode2_time:.2f}s")
    
    total_time = import_time + init_time + encode_time
    print(f"\n✓ Total initialization time: {total_time:.2f}s")
    print(f"  Recommended timeout: {total_time * 2:.0f}s ({total_time * 2000:.0f}ms)")
    
    return total_time

if __name__ == "__main__":
    try:
        total = measure_model_init()
        sys.exit(0)
    except Exception as e:
        print(f"✗ Error: {e}")
        sys.exit(1)