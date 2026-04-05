/**
 * apply-bot — resume-parser.js
 * Utilities for structuring and normalising parsed resume data.
 */

/**
 * Normalise a structured resume object returned by Gemini.
 * Fills in defaults for any missing keys so the rest of the
 * codebase can rely on a consistent shape.
 *
 * @param {object} raw  Output from parseResumeWithGemini()
 * @returns {object}
 */
export function structureResume(raw) {
  const experience = Array.isArray(raw.experience)
    ? raw.experience.map(normaliseExperience)
    : [];

  return {
    name: raw.name || '',
    email: raw.email || '',
    phone: raw.phone || '',
    location: raw.location || '',
    address_line1: raw.address_line1 || raw.address || '',
    city: raw.city || '',
    state_region: raw.state_region || raw.state || '',
    postal_code: raw.postal_code || raw.zip || '',
    linkedin: raw.linkedin || '',
    github: raw.github || '',
    portfolio: raw.portfolio || '',
    pronouns: raw.pronouns || '',
    sensitive_optin: raw.sensitive_optin === true,
    gender: raw.gender || '',
    race: raw.race || '',
    veteran: raw.veteran || '',
    disability: raw.disability || '',
    pronouns_sensitive: raw.pronouns_sensitive || '',
    current_company: raw.current_company || experience[0]?.company || '',
    current_title: raw.current_title || experience[0]?.title || '',
    why_company_default: raw.why_company_default || '',
    why_role_default: raw.why_role_default || '',
    additional_info_default: raw.additional_info_default || '',
    start_date: raw.start_date || '',
    requires_sponsorship: raw.requires_sponsorship || '',
    summary: raw.summary || '',
    skills: Array.isArray(raw.skills) ? raw.skills : [],
    experience,
    education: Array.isArray(raw.education)
      ? raw.education.map(normaliseEducation)
      : [],
    certifications: Array.isArray(raw.certifications) ? raw.certifications : [],
    languages: Array.isArray(raw.languages) ? raw.languages : [],
    years_of_experience: deriveYearsOfExperience(raw, experience),
  };
}

function deriveYearsOfExperience(raw, experience) {
  const explicitYears = Number(raw?.years_of_experience);
  const safeExplicitYears = Number.isFinite(explicitYears) && explicitYears > 0 ? explicitYears : 0;
  const estimatedYears = estimateYearsFromExperience(experience);

  return Math.max(safeExplicitYears, estimatedYears);
}

function estimateYearsFromExperience(experience = []) {
  if (!Array.isArray(experience) || experience.length === 0) return 0;

  const ranges = experience
    .map((item) => ({
      start: parseYearishDate(item?.start),
      end: parseYearishDate(item?.end, true),
    }))
    .filter((range) => range.start && range.end && range.end >= range.start);

  if (ranges.length === 0) return 0;

  const earliestStart = Math.min(...ranges.map((range) => range.start.getTime()));
  const latestEnd = Math.max(...ranges.map((range) => range.end.getTime()));
  const diffYears = (latestEnd - earliestStart) / (1000 * 60 * 60 * 24 * 365.25);

  return Math.max(1, Math.round(diffYears));
}

function parseYearishDate(value, fallbackToNow = false) {
  const text = String(value || '').trim();
  if (!text) return fallbackToNow ? new Date() : null;
  if (/present|current|now/i.test(text)) return new Date();

  const directDate = new Date(text);
  if (!Number.isNaN(directDate.getTime())) return directDate;

  const yearMatch = text.match(/(19|20)\d{2}/);
  if (yearMatch) {
    return new Date(Number(yearMatch[0]), 0, 1);
  }

  return fallbackToNow ? new Date() : null;
}

function normaliseExperience(exp) {
  return {
    company: exp.company || '',
    title: exp.title || '',
    start: exp.start || '',
    end: exp.end || 'Present',
    description: exp.description || '',
  };
}

function normaliseEducation(edu) {
  return {
    institution: edu.institution || '',
    degree: edu.degree || '',
    field: edu.field || '',
    year: edu.year || '',
  };
}

/**
 * Derive a human-readable summary line from a structured resume.
 * Used for display in the popup status card.
 *
 * @param {object} resume  Structured resume object.
 * @returns {string}
 */
export function resumeDisplayName(resume) {
  return resume?.name || 'Resume loaded';
}
