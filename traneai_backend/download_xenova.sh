#!/bin/bash
set -e

BASE_URL="https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main"
TARGET_DIR="node_modules/@xenova/transformers/models/Xenova/all-MiniLM-L6-v2"

FILES=(
  "config.json"
  "tokenizer.json"
  "tokenizer_config.json"
  "special_tokens_map.json"
  "vocab.txt"
  "onnx/model_quantized.onnx"
  "onnx/model.onnx"
)

for file in "${FILES[@]}"; do
  echo "Downloading $file..."
  curl -sSL -o "$TARGET_DIR/$file" "$BASE_URL/$file"
done

echo "All files downloaded successfully."
