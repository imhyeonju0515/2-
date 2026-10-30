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

// .env.local 이 있으면 읽는다 (이미 설정된 환경변수가 우선)
try { process.loadEnvFile(path.join(__dirname, '.env.local')); } catch {}

const env = n => (process.env[n] || '').trim();
const KEY_PARAM = env('JEJU_KEY_PARAM') || 'serviceKey';
const TTL = 60 * 60 * 1000;

// API 응답 필드(데이터셋 컬럼명) -> 화면에서 쓰는 키
const INFO_MAP = {
  '데이터 고유번호': 'id', '장소명': 'place', '위도': 'lat', '경도': 'lon',
  '분류': 'cat', '디렉토리1': 'd1', '디렉토리2': 'd2', '제목': 'title', '부제목': 'sub',
  '저작자': 'author', '주제': 'subject', '내용': 'content', '목차': 'toc', '초록': 'abstract',
  '발행자': 'publisher', '발행일': 'date', '자료유형': 'type', '자료형태': 'form',
  '언어': 'lang', '범위': 'scope', '출처': 'source', '기여자': 'contrib', '참고문헌': 'ref',
  '링크': 'url', '데이터기준일자': 'base',
};
const LOC_MAP = {
  '데이터 고유번호': 'id', '장소명': 'place', '위도': 'lat', '경도': 'lon',
  '우편번호': 'zip', '위치': 'addr', '좌표계값': 'crs',
  '데이터 상세보기 URL': 'url', '데이터기준일자': 'base',
};

// 응답 JSON 어디에 있든 레코드 배열을 찾는다 (공공데이터포털 response.body.items.item 등)
function findRows(x) {
  if (Array.isArray(x)) return x.length && typeof x[0] === 'object' ? x : null;
  if (x && typeof x === 'object') {
    for (const v of Object.values(x)) { const r = findRows(v); if (r) return r; }
  }
  return null;
}

async function fetchPage(baseUrl, key, page, perPage) {
  const u = new URL(baseUrl);
  u.searchParams.set(KEY_PARAM, key);
  u.searchParams.set('page', page);
  u.searchParams.set('perPage', perPage);
  new URLSearchParams(env('JEJU_EXTRA_PARAMS')).forEach((v, k) => u.searchParams.set(k, v));
  const res = await fetch(u);
  if (!res.ok) throw new Error(`API ${res.status} ${res.statusText}`);
  const text = await res.text();
  try { return JSON.parse(text); }
  catch { throw new Error('JSON이 아닌 응답입니다: ' + text.slice(0, 120)); }
}

// odcloud 형식(page/perPage/totalCount)이면 전부 받을 때까지 페이지를 넘긴다
async function fetchRows(baseUrl, key, map) {
  if (!baseUrl) throw new Error('엔드포인트 URL 환경변수가 없습니다.');
  const PER = 1000;
  const all = [];
  for (let page = 1; page <= 50; page++) {
    const json = await fetchPage(baseUrl, key, page, PER);
    const rows = findRows(json);
    if (!rows) {
      if (page === 1) throw new Error('응답에서 데이터 목록을 찾지 못했습니다: ' + JSON.stringify(json).slice(0, 160));
      break;
    }
    all.push(...rows);
    const total = json.totalCount ?? json.matchCount;
    if (!total || all.length >= total || rows.length < PER) break;
  }
  return all.map(r => {
    const o = {};
    for (const [k, v] of Object.entries(r)) o[map[k] || k] = v;
    return o;
  });
}

const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };

function merge(info, loc) {
  const locById = new Map(loc.map(r => [String(r.id), r]));
  return info.map(r => {
    const l = locById.get(String(r.id)) || {};
    const m = { ...r, ...l, content: r.content };
    m.url = l.url || r.url;
    m.id = +m.id;
    m.lat = num(r.lat ?? l.lat);
    m.lon = num(r.lon ?? l.lon);
    const addr = m.addr || '';
    m.city = /서귀포/.test(addr) ? '서귀포시' : /제주시/.test(addr) ? '제주시' : '';
    return m;
  }).filter(r => r.id);
}

let cache = null;
async function getPlaces() {
  if (cache && Date.now() - cache.at < TTL) return cache.data;
  const infoKey = env('JEJU_CULTURE_INFO_KEY');
  const locKey = env('JEJU_CULTURE_LOCATION_KEY');
  if (!infoKey || !locKey) throw new Error('환경변수 JEJU_CULTURE_INFO_KEY / JEJU_CULTURE_LOCATION_KEY 가 설정되지 않았습니다.');
  const [info, loc] = await Promise.all([
    fetchRows(env('JEJU_CULTURE_INFO_URL'), infoKey, INFO_MAP),
    fetchRows(env('JEJU_CULTURE_LOCATION_URL'), locKey, LOC_MAP),
  ]);
  const data = merge(info, loc);
  cache = { at: Date.now(), data };
  return data;
}

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
