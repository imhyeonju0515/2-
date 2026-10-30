// Vercel 서버리스 함수: /api/places
const { getPlaces } = require('../places');

module.exports = async (req, res) => {
  try {
    const data = await getPlaces();
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    res.status(200).json(data);
  } catch (e) {
    console.error(e.message);
    res.status(502).json({ error: '데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.' });
  }
};
