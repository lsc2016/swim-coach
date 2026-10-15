#!/bin/bash
# 수영 코치 실행: ./run.sh
cd "$(dirname "$0")" || exit 1

HOST="$(scutil --get LocalHostName 2>/dev/null || hostname -s).local"
IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo 127.0.0.1)"
mkdir -p certs

# 휴대폰에서 오프라인 저장(PWA)을 쓰려면 HTTPS가 필요해서, 이 맥 전용 인증서를 한 번 만든다.
if [ ! -f certs/ca.crt ]; then
  echo "처음 실행: 휴대폰용 인증서를 만듭니다..."
  openssl req -x509 -new -nodes -newkey rsa:2048 -sha256 -days 3650 \
    -keyout certs/ca.key -out certs/ca.crt -subj "/CN=Swim Coach Local CA" \
    -addext "basicConstraints=critical,CA:TRUE" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" 2>/dev/null
fi

SAN="DNS:$HOST,DNS:localhost,IP:$IP,IP:127.0.0.1"
if [ ! -f certs/server.crt ] || [ "$(cat certs/server.san 2>/dev/null)" != "$SAN" ]; then
  cat > certs/server.ext <<EOF
basicConstraints=CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=$SAN
EOF
  openssl req -new -nodes -newkey rsa:2048 -keyout certs/server.key -out certs/server.csr \
    -subj "/CN=$HOST" 2>/dev/null
  openssl x509 -req -in certs/server.csr -CA certs/ca.crt -CAkey certs/ca.key -CAcreateserial \
    -out certs/server.crt -days 800 -sha256 -extfile certs/server.ext 2>/dev/null
  echo "$SAN" > certs/server.san
fi

echo ""
echo "  🏊 수영 코치"
echo "  맥북:   http://localhost:${PORT:-8080}"
echo "  휴대폰: https://$HOST:${HTTPS_PORT:-8443}   (같은 와이파이)"
echo "  인증서 처음 설치: 휴대폰에서 http://$IP:${PORT:-8080}/ca.crt  → README 참고"
echo "  끄기:   Ctrl+C"
echo ""

exec python3 server.py
