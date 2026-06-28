// interview-prep.js
// Handles interview prep mode: generating questions, editing answers, saving/loading

import { $, sendMessage, setStatus } from '../../lib/utils.js';
import { showScreen } from './navigation.js';
import { sendToActiveTab } from '../../lib/utils.js';

// ── Interview prep state ──────────────────────────────────────────────────────

let currentApplicationId = null;
let generatedQuestions = [];

// ── Public API ────────────────────────────────────────────────────────────────

export async function initInterviewPrep() {
  // Attach handler for interview prep button in header
  $('header-interview-prep-btn')?.addEventListener('click', async () => {
    try {
      await openInterviewPrepForCurrentJob();
    } catch (err) {
      setStatus('interview-prep-status', '❌ ' + err.message, 'error');
    }
  });

  // Attach handler for generate button
  $('interview-prep-generate-btn')?.addEventListener('click', async () => {
    await generateInterviewQuestions();
  });
}

export async function openInterviewPrepForApplication(applicationId) {
  currentApplicationId = applicationId;

  // Fetch application details
  const resp = await sendMessage({ type: 'GET_APPLICATION', payload: { id: applicationId } });
  if (!resp?.success || !resp.application) {
    throw new Error(resp?.error || 'Could not load application.');
  }

  const app = resp.application;

  // Populate job info
  $('interview-prep-company').textContent = app.company || 'Unknown Company';
  $('interview-prep-title').textContent = app.title || 'Untitled Position';
  const metaParts = [];
  if (app.location) metaParts.push(app.location);
  if (app.employment_type) metaParts.push(app.employment_type);
  if (app.remote) metaParts.push('Remote');
  $('interview-prep-meta').textContent = metaParts.join(' · ') || '—';

  const jobInfo = $('interview-prep-job-info');
  if (jobInfo) jobInfo.classList.remove('hidden');
  const genBtn = $('interview-prep-generate-btn');
  if (genBtn) genBtn.disabled = false;
  const questions = $('interview-prep-questions');
  if (questions) questions.classList.add('hidden');
  generatedQuestions = [];

  // Load any existing interview prep data
  await loadInterviewPrepData(applicationId);

  await showScreen('interview-prep');
}

export async function openInterviewPrepForCurrentJob() {
  // Try to get the currently active job from the page
  const resp = await sendToActiveTab({ type: 'GET_JOB_INFO' });
  if (!resp?.success || !resp.job) {
    throw new Error('Could not read job details from current page. Open a job posting first.');
  }

  // Check if this job is already in tracker
  const state = await sendMessage({ type: 'GET_STATE' });
  const applications = state?.applications || [];
  const existing = applications.find(a =>
    a.company === resp.job.company && a.title === resp.job.title
  );

  if (existing) {
    await openInterviewPrepForApplication(existing.id);
    return;
  }

  // Create a temporary application object
  currentApplicationId = null;
  const app = {
    company: resp.job.company || 'Unknown Company',
    title: resp.job.title || 'Untitled Position',
    location: resp.job.location || '',
    employment_type: resp.job.employment_type || '',
    remote: resp.job.remote || false,
  };

  $('interview-prep-company').textContent = app.company;
  $('interview-prep-title').textContent = app.title;
  const metaParts = [];
  if (app.location) metaParts.push(app.location);
  if (app.employment_type) metaParts.push(app.employment_type);
  if (app.remote) metaParts.push('Remote');
  $('interview-prep-meta').textContent = metaParts.join(' · ') || '—';

  const jobInfo = $('interview-prep-job-info');
  if (jobInfo) jobInfo.classList.remove('hidden');
  const genBtn = $('interview-prep-generate-btn');
  if (genBtn) genBtn.disabled = false;
  const questions = $('interview-prep-questions');
  if (questions) questions.classList.add('hidden');
  generatedQuestions = [];

  await showScreen('interview-prep');
}

// ── Interview prep data persistence ──────────────────────────────────────────

async function loadInterviewPrepData(applicationId) {
  try {
    const resp = await sendMessage({
      type: 'GET_INTERVIEW_PREP',
      payload: { applicationId }
    });
    if (resp?.success && resp.data?.questions) {
      generatedQuestions = resp.data.questions;
      renderQuestions();
      const questions = $('interview-prep-questions');
      if (questions) questions.classList.remove('hidden');
    }
  } catch (err) {
    console.warn('Could not load interview prep data:', err);
  }
}

async function saveInterviewPrepData() {
  if (!currentApplicationId) return;

  try {
    await sendMessage({
      type: 'SAVE_INTERVIEW_PREP',
      payload: {
        applicationId: currentApplicationId,
        questions: generatedQuestions,
      }
    });
  } catch (err) {
    console.warn('Could not save interview prep data:', err);
  }
}

// ── Question generation ──────────────────────────────────────────────────────

async function generateInterviewQuestions() {
  const generateBtn = $('interview-prep-generate-btn');
  generateBtn?.disabled = true;
  generateBtn?.textContent = '⏳ Generating...';
  setStatus('interview-prep-status', '⏳ Generating interview questions...');

  // Capture active application id at the start
  const activeAppId = currentApplicationId;

  try {
    // Get the application details for context
    let context = {};
    if (activeAppId) {
      const resp = await sendMessage({ type: 'GET_APPLICATION', payload: { id: activeAppId } });
      if (resp?.success) context = resp.application;
    } else {
      // Use current job info
      const jobResp = await sendToActiveTab({ type: 'GET_JOB_INFO' });
      if (jobResp?.success) context = jobResp.job;
    }

    // Verify application id still matches
    if (activeAppId !== currentApplicationId) return;

    // Get user profile for personalized answers
    const state = await sendMessage({ type: 'GET_STATE' });
    const profile = state?.profile || {};
    const resume = state?.resume?.structured || {};

    // Verify application id still matches
    if (activeAppId !== currentApplicationId) return;

    // Send to Gemini for question generation
    const resp = await sendMessage({
      type: 'GENERATE_INTERVIEW_QUESTIONS',
      payload: {
        job: context,
        profile,
        resume,
      },
    });

    if (!resp?.success) {
      throw new Error(resp?.error || 'Failed to generate questions.');
    }

    // Verify application id still matches
    if (activeAppId !== currentApplicationId) return;

    generatedQuestions = resp.questions || [];
    renderQuestions();
    $('interview-prep-questions')?.classList.remove('hidden');
    setStatus('interview-prep-status', '✅ Questions generated! Edit answers as needed.', 'success');

    // Auto-save
    await saveInterviewPrepData();

  } catch (err) {
    if (activeAppId !== currentApplicationId) return;
    setStatus('interview-prep-status', '❌ ' + err.message, 'error');
  } finally {
    if (activeAppId !== currentApplicationId) return;
    generateBtn?.disabled = false;
    generateBtn?.textContent = '✨ Generate Questions';
  }
}

// ── Rendering ────────────────────────────────────────────────────────────────

function renderQuestions() {
  const container = $('interview-prep-questions-list');
  if (!container) return;

  if (generatedQuestions.length === 0) {
    container.innerHTML = '<p class="helper-text">No questions generated yet. Click "Generate Questions" to start.</p>';
    return;
  }

  container.innerHTML = generatedQuestions.map((q, index) => `
    <div class="interview-prep-question-card" data-index="${index}">
      <div class="interview-prep-question-header">
        <h4 class="interview-prep-question-text">${escapeHtml(q.question || 'Untitled Question')}</h4>
        <span class="interview-prep-question-type">${escapeHtml(q.type || 'general')}</span>
      </div>
      <label for="answer-input-${index}" class="visually-hidden">Your answer for: ${escapeHtml(q.question || 'Question')}</label>
      <textarea
        id="answer-input-${index}"
        class="interview-prep-answer-input"
        placeholder="Draft your answer here..."
        data-index="${index}"
        rows="4"
      >${escapeHtml(q.answer || '')}</textarea>
      <div class="interview-prep-question-actions">
        <button class="btn btn-sm interview-prep-suggest-btn" data-index="${index}">✨ Suggest Answer</button>
        <button class="btn btn-sm btn-danger interview-prep-delete-btn" data-index="${index}">🗑 Delete</button>
      </div>
      ${q.suggestion ? `<div class="interview-prep-suggestion">${escapeHtml(q.suggestion)}</div>` : ''}
    </div>
  `).join('');

  // Attach event listeners
  container.querySelectorAll('.interview-prep-answer-input').forEach(textarea => {
    textarea.addEventListener('blur', handleAnswerEdit);
  });

  container.querySelectorAll('.interview-prep-suggest-btn').forEach(btn => {
    btn.addEventListener('click', handleSuggestAnswer);
  });

  container.querySelectorAll('.interview-prep-delete-btn').forEach(btn => {
    btn.addEventListener('click', handleDeleteQuestion);
  });
}

async function handleAnswerEdit(event) {
  const index = parseInt(event.target.dataset.index, 10);
  if (isNaN(index) || !generatedQuestions[index]) return;

  generatedQuestions[index].answer = event.target.value;
  await saveInterviewPrepData();
}

async function handleSuggestAnswer(event) {
  const index = parseInt(event.target.dataset.index, 10);
  if (isNaN(index) || !generatedQuestions[index]) return;

  const btn = event.target;
  btn.disabled = true;
  btn.textContent = '⏳ Suggesting...';

  // Capture active application id at the start
  const activeAppId = currentApplicationId;

  try {
    const question = generatedQuestions[index];
    const state = await sendMessage({ type: 'GET_STATE' });
    const profile = state?.profile || {};
    const resume = state?.resume?.structured || {};

    // Verify application id still matches
    if (activeAppId !== currentApplicationId) return;

    const resp = await sendMessage({
      type: 'GENERATE_INTERVIEW_ANSWER',
      payload: {
        question: question.question,
        type: question.type,
        profile,
        resume,
        job: question.jobContext || {},
      },
    });

    // Verify application id still matches
    if (activeAppId !== currentApplicationId) return;

    if (resp?.success && resp.suggestion) {
      question.suggestion = resp.suggestion;
      generatedQuestions[index] = question;
      renderQuestions();
      await saveInterviewPrepData();
      setStatus('interview-prep-status', '✅ Answer suggestion added!', 'success');
    }
  } catch (err) {
    if (activeAppId !== currentApplicationId) return;
    setStatus('interview-prep-status', '❌ ' + err.message, 'error');
  } finally {
    if (activeAppId !== currentApplicationId) return;
    btn.disabled = false;
    btn.textContent = '✨ Suggest Answer';
  }
}

async function handleDeleteQuestion(event) {
  const index = parseInt(event.target.dataset.index, 10);
  if (isNaN(index) || !generatedQuestions[index]) return;

  if (!confirm('Delete this question?')) return;

  generatedQuestions.splice(index, 1);
  renderQuestions();
  await saveInterviewPrepData();
  setStatus('interview-prep-status', 'Question deleted.', 'info');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}