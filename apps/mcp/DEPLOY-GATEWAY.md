# MCP 원격 게이트웨이 배포 (ai.prosell.kr)

중앙 원격 MCP 게이트웨이(`src/gateway.js` + `src/oauth.js`)를 `ai.prosell.kr` 에 올리는 절차.
**guide 와 동일한 블루-그린 방식**(`apps/deploy-guide.sh` 컨벤션)으로 `apps/deploy-gateway.sh` 가
무중단 배포한다. **게이트웨이 전용 경로만** nginx 로 라우팅한다. 설계 배경: [REMOTE_MCP_DESIGN.md](REMOTE_MCP_DESIGN.md).

> 전제: `ai.prosell.kr` 는 호스트 nginx + PM2 로 guide 를 서빙 중(도커 쇼핑몰 백엔드와 별개).
> 게이트웨이는 **공개 HTTPS 필수**(원격 커넥터는 Anthropic 클라우드에서 출발 + provisioning 콜백이 HTTPS 강제).

## 0. 산출물

| 파일 | 용도 |
|---|---|
| `apps/deploy-gateway.sh` | **블루-그린 배포 스크립트**(8786↔8787, PM2 + nginx upstream 스위칭). guide 와 동일 컨벤션 |
| `apps/mcp/deploy/gateway.env.example` | 운영 환경변수 템플릿 → `gateway.env` 로 복사(커밋 금지, .gitignore 처리됨) |
| `apps/mcp/deploy/nginx-ai-gateway.conf` | ai.prosell.kr 에 추가할 nginx location 스니펫(최초 1회) |

## 1. 환경변수 (최초 1회)

```bash
cd <레포>/apps/mcp
cp deploy/gateway.env.example deploy/gateway.env
# 편집: 최소
#   PROSELL_GATEWAY_BASE=https://ai.prosell.kr
#   PROSELL_FED_SCOPE=user
# PORT 는 deploy-gateway.sh 가 대상 포트(8786/8787)로 덮어쓰므로 신경 쓸 필요 없음.
# (FED_CLIENT 류는 비워둬도 됨 — 첫 연결 provisioning 으로 자동 획득)
```

## 2. nginx 라우팅 (최초 1회)

`deploy/nginx-ai-gateway.conf` 의 `location` 들을 ai.prosell.kr 443 `server { }` 안
**guide `location /` 앞**에 추가하고, 스위처블 upstream 파일을 첫 포트로 만든다:

```bash
echo 'upstream prosell-mcp { server 127.0.0.1:8787; }' | sudo tee /etc/nginx/upstreams/prosell-mcp.conf
sudo nginx -t && sudo systemctl reload nginx
```

> `/etc/nginx/upstreams/*.conf` 가 http{} 에 include 되는지 확인(guide 의 prosell-ai.conf 와 동일 경로).

## 3. 배포 (이후 반복)

```bash
cd <레포>/apps
./deploy-gateway.sh           # 현재 코드로 무중단 배포
./deploy-gateway.sh --pull    # git pull 후 배포
```

스크립트가 하는 일: 반대 포트로 새 인스턴스 기동 → `/healthz` 헬스체크 → 통과 시 upstream 스위칭
→ 옛 인스턴스 정리. 실패 시 라이브 포트 유지(자동 롤백). 최초 실행은 `pm2 startup` 1회 등록 권장.

검증(공개 도메인):
```bash
curl -s https://ai.prosell.kr/.well-known/oauth-protected-resource
#   {"resource":"https://ai.prosell.kr/mcp","authorization_servers":["https://ai.prosell.kr"]}
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://ai.prosell.kr/mcp -d '{}'   # 401(WWW-Authenticate)
curl -s https://ai.prosell.kr/llms.txt | head -c 40    # ← guide 가 그대로 응답(라우팅 충돌 없음 확인)
```

## 5. 클로드 커넥터로 연결(E2E)

1. 클로드(웹/데스크탑) → 설정 → 커넥터 추가 → URL: `https://ai.prosell.kr/mcp`
2. OAuth 화면에서 **쇼핑몰 아이디 입력 + 운영자 로그인 + 동의**
   - 그 쇼핑몰 첫 연결이면 등록(provisioning)이 같은 로그인에 자동 포함됨.
3. 연결 후 도구 호출 → 해당 쇼핑몰 데이터가 오는지 확인.

## 6. 업데이트 / 롤백

```bash
cd <레포>/apps && ./deploy-gateway.sh --pull   # pull→빌드없음→반대포트 기동→헬스→스위칭
```
- **롤백**: 직전 라이브 포트로 되돌리려면 `deploy-gateway.sh` 를 한 번 더 실행(포트가 다시 스왑됨),
  또는 `/etc/nginx/upstreams/prosell-mcp.conf` 를 직전 포트로 직접 바꾸고 `sudo nginx -s reload`.
> ⚠️ OAuth 대기상태/자격증명 캐시가 **인메모리** → 포트 스위칭 시 진행 중 OAuth 플로우만 다시 로그인.
> 발급 완료된 합성토큰은 무상태라 영향 없음. 자격증명 캐시는 다음 first-run 때 재획득. 영속화는 3단계 과제.

## 7. 운영 주의

- **공개 HTTPS 필수**: `PROSELL_GATEWAY_BASE` 는 실제 https 도메인. http 면 provisioning 콜백이 거부됨.
- **방화벽**: 8786/8787 은 외부 비공개(127.0.0.1). 외부 노출은 nginx(443)만.
- **레이트리밋/WAF** 권장(인가서버 표면 노출).
- **로그**: `pm2 logs prosell-mcp-gateway-<포트>`. 토큰 값은 로그에 남기지 않는다(현재 코드 미기록).

## 부록 — 전용 서브도메인 대안

`mcp.prosell.kr` 로 분리하려면: 그 server 블록에서 `location / { proxy_pass http://prosell-mcp; ... }`
하나로 단순화하고 `PROSELL_GATEWAY_BASE=https://mcp.prosell.kr` 로 두면 된다(경로 충돌 걱정 없음).
단 커넥터 URL 이 `https://mcp.prosell.kr/mcp` 가 된다.
