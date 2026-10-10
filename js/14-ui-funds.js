// 資金タブ
function renderSalaryPanel() {
  const setText = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  };
  const memberSalary = (typeof getTotalMemberMonthlySalary === 'function') ? getTotalMemberMonthlySalary() : 0;
  const managerSalary = (typeof getTotalManagerMonthlySalary === 'function') ? getTotalManagerMonthlySalary() : 0;
  const total = memberSalary + managerSalary;

  const rosterCount = Array.isArray(idolRoster) ? idolRoster.length : 0;
  const mgrCount = Array.isArray(managers) ? managers.filter(Boolean) : [];

  setText('txt-member-count', String(rosterCount));
  setText('txt-manager-count', String(mgrCount.length));
  setText('txt-member-salary', formatMoney(memberSalary));
  setText('txt-manager-salary', formatMoney(managerSalary));
  setText('txt-total-salary', formatMoney(total));
  setText('txt-annual-salary', formatMoney(total * 12));
  setText('txt-year-salary', formatMoney(yearlyStats?.salary || 0));

  const startFans = typeof groupFansAtYearStart !== 'undefined' ? (groupFansAtYearStart || 0) : 0;
  const prevFans = typeof previousYearGroupFansAtYearStart !== 'undefined' ? (previousYearGroupFansAtYearStart || 0) : 0;
  const fanGrowth = Math.max(0, startFans - prevFans);
  const growthFactor = typeof MEMBER_SALARY_GROUP_GROWTH_FACTOR !== 'undefined' ? MEMBER_SALARY_GROUP_GROWTH_FACTOR : 6;
}

function renderFundsTab() {
  const setText = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  };

    if (typeof formatMoney === 'function' && typeof funds !== 'undefined') {
      setText('txt-funds', formatMoney(funds));
      const exactEl = document.getElementById('txt-funds-exact');
      if (exactEl) {
        exactEl.textContent = Math.abs(funds) >= 100000 ? `（${Math.round(funds).toLocaleString()}円）` : '';
      }
    }

    setText('txt-year-sales', `${(yearlyStats?.sales || 0).toLocaleString()} 枚`);
    setText('txt-year-audience', `${(yearlyStats?.audience || 0).toLocaleString()} 人`);

    const streamEl = document.getElementById('txt-year-stream');
    if (streamEl && typeof formatMoney === 'function') {
      const net = (yearlyStats?.streamRevenue || 0) - (yearlyStats?.streamCost || 0);
      streamEl.textContent = formatMoney(net);
    }

  renderSalaryPanel();
}
