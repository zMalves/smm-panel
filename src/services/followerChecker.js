/**
 * Extrai o identificador ou nome de usuário a partir de um link
 */
function extractUsername(link) {
  if (!link) return '';
  const clean = link.trim().replace(/\/+$/, '');
  const parts = clean.split('/');
  return parts[parts.length - 1].replace('@', '');
}

/**
 * Consulta seguidores de múltiplas fontes públicas com fallback gracioso
 */
async function fetchCurrentFollowers(link) {
  const username = extractUsername(link);
  if (!username) return null;

  // Tentativa 1: Endpoint público insta-stories-viewer com parsing de precisão
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(`https://insta-stories-viewer.com/${encodeURIComponent(username)}/`, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    });
    clearTimeout(timeout);

    if (res.ok) {
      const html = await res.text();
      const match = html.match(/profile__stats-followers">([0-9.,kKm]+)<\/span>/i) ||
                    html.match(/([0-9.,kKm]+)\s*(?:followers|seguidores)/i);
      if (match && match[1]) {
        let raw = match[1].replace(',', '.').toLowerCase().trim();
        let mult = 1;
        if (raw.includes('k')) { mult = 1000; raw = raw.replace('k', ''); }
        if (raw.includes('m')) { mult = 1000000; raw = raw.replace('m', ''); }
        const count = Math.round(parseFloat(raw) * mult);
        if (!isNaN(count) && count > 0) {
          return { username, followers: count, source: 'insta-stories-viewer' };
        }
      }
    }
  } catch (err) {
    // Timeout ou erro de rede tratado sem quebrar fluxo
  }

  // Tentativa 2: Consulta pública direta com headers mobile
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`https://www.instagram.com/${encodeURIComponent(username)}/`, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0.0.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    clearTimeout(timeout);

    if (res.ok) {
      const html = await res.text();
      const metaMatch = html.match(/content="([0-9.,kKm]+)\s*(?:followers|seguidores)/i);
      if (metaMatch && metaMatch[1]) {
        let raw = metaMatch[1].replace(',', '.').toLowerCase().trim();
        let mult = 1;
        if (raw.includes('k')) { mult = 1000; raw = raw.replace('k', ''); }
        if (raw.includes('m')) { mult = 1000000; raw = raw.replace('m', ''); }
        const count = Math.round(parseFloat(raw) * mult);
        if (!isNaN(count) && count > 0) {
          return { username, followers: count, source: 'instagram-meta' };
        }
      }
    }
  } catch (err) {
    // Tratamento resiliente
  }

  return { username, followers: null, source: 'manual_or_cached' };
}

module.exports = {
  extractUsername,
  fetchCurrentFollowers
};
