// 제주 역사문화 지도 서버 (의존성 없음, Node 18+)
// 브라우저에는 API 키를 노출하지 않고, 이 서버가 키를 환경변수에서 읽어 대신 호출합니다.
//
//   JEJU_CULTURE_INFO_KEY       일반정보 API 서비스키   (필수)
//   JEJU_CULTURE_LOCATION_KEY   위치정보 API 서비스키   (필수)
//   JEJU_CULTURE_INFO_URL       일반정보 API 엔드포인트 (필수)
//   JEJU_CULTURE_LOCATION_URL   위치정보 API 엔드포인트 (필수)
//   JEJU_KEY_PARAM              키 쿼리 파라미터 이름   (기본 serviceKey)
//   JEJU_EXTRA_PARAMS           추가 쿼리, 예: "type=json&numOfRows=1000"
//   PORT                        (기본 3000)

const http = require('http');
const fs = require('fs');
const path = require('path');

const { getPlaces } = require('./places');

http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  if (pathname === '/api/places') {
    try {
      const data = await getPlaces();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
    } catch (e) {
      console.error(e.message);
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }
  if (pathname === '/' || pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(path.join(__dirname, 'index.html')).pipe(res);
    return;
  }
  res.writeHead(404); res.end('Not found');
}).listen(+process.env.PORT || 3000, () => console.log('http://localhost:' + (process.env.PORT || 3000)));
