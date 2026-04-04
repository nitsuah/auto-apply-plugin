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
  return {
    name: raw.name || '',
    email: raw.email || '',
    phone: raw.phone || '',
    location: raw.location || '',
    linkedin: raw.linkedin || '',
    github: raw.github || '',
    portfolio: raw.portfolio || '',
    summary: raw.summary || '',
    skills: Array.isArray(raw.skills) ? raw.skills : [],
    experience: Array.isArray(raw.experience)
      ? raw.experience.map(normaliseExperience)
      : [],
    education: Array.isArray(raw.education)
      ? raw.education.map(normaliseEducation)
      : [],
    certifications: Array.isArray(raw.certifications) ? raw.certifications : [],
    languages: Array.isArray(raw.languages) ? raw.languages : [],
    years_of_experience: Number(raw.years_of_experience) || 0,
  };
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
