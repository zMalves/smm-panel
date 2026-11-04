/**
 * Extrai o nome de usuário ou identificador de links sociais
 */
function extractUsername(link) {
  if (!link) return '';
  const clean = link.trim().replace(/\/+$/, '');
  const parts = clean.split('/');
  return parts[parts.length - 1].replace('@', '');
}

/**
 * Consulta contagem pública de seguidores
 * Suporta Instagram e fallback
 */
async function fetchCurrentFollowers(link) {
  const username = extractUsername(link);
  if (!username) return null;

  // Tentativa 1: API pública proxy do Instagram
  try {
    const res = await fetch(`https://insta-stories-viewer.com/${encodeURIComponent(username)}/`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    if (res.ok) {
      const html = await res.text();
      const match = html.match(/profile__stats-followers">([0-9.,kKm]+)<\/span>/i);
      if (match && match[1]) {
        let raw = match[1].replace(',', '.').toLowerCase();
        let mult = 1;
        if (raw.includes('k')) { mult = 1000; raw = raw.replace('k', ''); }
        if (raw.includes('m')) { mult = 1000000; raw = raw.replace('m', ''); }
        const count = Math.round(parseFloat(raw) * mult);
        if (!isNaN(count) && count > 0) {
          return { username, followers: count, source: 'live_web' };
        }
      }
    }
  } catch (err) {
    console.error('Erro ao consultar seguidores web:', err.message);
  }

  return { username, followers: null, source: 'unavailable' };
}

module.exports = {
  extractUsername,
  fetchCurrentFollowers
};
