// 順位タブ
function getRivalTeamPower(team) {
  const base = team?.basePower || 0;
  const growth = (team?.sales || 0) / 200000;
  return Math.max(10, Math.round(base + growth));
}

// プレイヤーチームステータスを同期する。
function syncPlayerTeamStats() {
  if (!Array.isArray(leagueTeams)) return;
  const pTeam = leagueTeams.find(team => team && team.id === 'player');
  if (!pTeam) return;
  pTeam.sales = yearlyStats?.sales || 0;
  pTeam.audience = yearlyStats?.audience || 0;
  pTeam.showCount = countPlayerLiveShows();
  pTeam.basePower = typeof getPlayerTeamOverall === 'function' ? getPlayerTeamOverall() : 50;
}

// プレイヤーライブ公演を件数計算する。
function countPlayerLiveShows() {
  let count = 0;
  if (typeof getScheduledLiveEntries !== 'function') return 0;
  getScheduledLiveEntries().forEach(entry => {
    if (entry && entry.year === currentYear && typeof getLiveEntryShowDates === 'function') {
      count += getLiveEntryShowDates(entry).length;
    }
  });
  return count;
}

// リーグランキングを取得する。
function getLeagueRanking() {
  syncPlayerTeamStats();
  if (!Array.isArray(leagueTeams)) return [];
  const overall = typeof getPlayerTeamOverall === 'function' ? getPlayerTeamOverall() : 50;
  return leagueTeams
    .filter(Boolean)
    .map(team => {
      const power = team.id === 'player' ? overall : getRivalTeamPower(team);
      return {
        id: team.id,
        name: team.name,
        isPlayer: team.id === 'player',
        power,
        sales: team.sales || 0,
        audience: team.audience || 0,
        showCount: team.showCount || 0
      };
    })
    .sort((a, b) => b.power - a.power)
    .map((team, index) => ({ ...team, rank: index + 1 }));
}

// プレイヤー順位を取得する。
function getPlayerRank() {
  const ranking = getLeagueRanking();
  const me = ranking.find(team => team.isPlayer);
  return me ? { rank: me.rank, total: ranking.length, power: me.power, top: ranking[0] } : null;
}

// ランキングパネルを描画する。
function renderRankingPanel() {
  const list = document.getElementById('ranking-list');
  const note = document.getElementById('ranking-note');
  if (!list || !note) return;
  const ranking = getLeagueRanking();
  const playerInfo = getPlayerRank();
  if (!playerInfo) {
    list.innerHTML = '';
    note.textContent = '';
    return;
  }
  note.innerHTML = `自グループは <strong>${playerInfo.rank}位 / ${playerInfo.total}グループ</strong>（総合力 ${playerInfo.power}）`
    + `<br>総合力は選抜チームの平均評価です。他グループは売上に応じて影響力が増減します。`;

  list.innerHTML = ranking.map(team => {
    const rankClass = team.rank <= 3 ? ' top' : '';
    return `
      <div class="ranking-row${team.isPlayer ? ' player' : ''}">
        <span class="ranking-rank${rankClass}">${team.rank}</span>
        <span class="ranking-name">
          <span class="ranking-name-main">${escapeHtml(team.name)}${team.isPlayer ? '（自グループ）' : ''}</span>
          <span class="ranking-name-sub">売上 ${team.sales.toLocaleString()}枚 / 動員 ${team.audience.toLocaleString()}人 / 公演 ${team.showCount}回</span>
        </span>
        <span class="ranking-power">${team.power}</span>
      </div>`;
  }).join('');
}

// 週次Actionパネルを描画する。

function renderRankingTab() {
  renderRankingPanel();
}
