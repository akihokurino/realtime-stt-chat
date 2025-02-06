# リアルタイム音声認識API

## サンプルリクエスト

```shell
curl -X POST http://localhost:8080/chat_completion \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "こんにちは。500文字で自己紹介をしてください。"}
    ]
  }'
```