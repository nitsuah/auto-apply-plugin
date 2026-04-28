// tracker-csv.js
// CSV import/export logic for tracker

function setTrackerScreenStatus(msg, type = '') {
  const el = document.getElementById('tracker-status');
  if (!el) return;
  el.textContent = msg;
  el.className = 'status-msg' + (type ? ' ' + type : '');
}

export function exportCsv(applications) {
  const header = 'Company,Role Title,Status,Date,Employment Type,Remote,Location,Salary Range,Scorecard,Verdict,URL,Notes';
  const rows = applications.map((a) =>
    [
      a.company,
      a.title,
      a.status,
      a.date,
      a.employment_type,
      a.remote ? 'Yes' : 'No',
      a.location,
      a.salary_range,
      a.scorecard,
      a.verdict,
      a.url,
      a.description || a.jd_snippet || '',
    ]
      .map((v) => '"' + String(v || '').replace(/"/g, '""') + '"')
      .join(',')
  );
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'apply-bot-tracker.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export async function importTrackerCsvFile(event, renderTracker, loadMainScreen, showScreen) {
  const input = event?.target;
  const file = input?.files?.[0];
  if (!file) return;

  setTrackerScreenStatus('GŦ Importing applications from CSVGǪ');

  try {
    const text = await file.text();
    const resp = await window.trackerSendMessage({
      type: 'IMPORT_APPLICATIONS_CSV',
      payload: { text },
    });

    if (!resp?.success) {
      throw new Error(resp?.error || 'Could not import the tracker CSV.');
    }

    await renderTracker();
    await loadMainScreen({ showMain: false });
    showScreen('tracker');

    const imported = Number(resp.imported || 0);
    const skipped = Number(resp.skipped || 0);
    const suffix = skipped ? ` (${skipped} skipped)` : '';
    setTrackerScreenStatus(
      `G�� Imported ${imported} application${imported === 1 ? '' : 's'} from CSV${suffix}.`,
      'success'
    );
  } catch (err) {
    setTrackerScreenStatus('G�� ' + err.message, 'error');
  } finally {
    if (input) input.value = '';
  }
}
