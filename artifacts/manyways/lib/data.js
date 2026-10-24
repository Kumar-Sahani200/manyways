export const STORAGE_KEY = "manyways.projects.v1";
export const COLORS = ["#ee4a1c", "#0e7a6b", "#b8860b", "#3d5a80", "#8a3b6e", "#5c6b2f"];
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const SAMPLES = {
  social: {
    title: "Lessons from six years of engineering (sample)",
    type: "social",
    original:
      "I have been a software engineer for six years. Here are five lessons I wish I had known when I started.\n\nLesson one: read other people's code before writing your own.\nLesson two: ask the dull question early.\nLesson three: write down why, not just what.\n\nWhat would you add?",
    variants: [
      ["Curiosity hook", "The best code review I ever got was one sentence long.\n\nIt took me six years to understand why it worked. Here are the five lessons hiding inside it.\n\n1. Read other people's code before writing your own.\n2. Ask the dull question early.\n3. Write down why, not just what.\n\nWhat would you add?"],
      ["Practical list first", "Five habits that would have saved me two years as an engineer:\n\n1. Read other people's code first.\n2. Ask the dull question early.\n3. Write down why, not just what.\n\nSave this for your first week on a new team."],
    ],
    goal: { audience: "Early-career software engineers", ageMin: 22, ageMax: 30, styles: "practical, educational, personal", outcome: "Encourage meaningful engagement", metric: "Thoughtful comments" },
  },
  story: {
    title: "The lighthouse keeper's choice (sample)",
    type: "story",
    original:
      "Maren climbed the last stair and found the lamp already lit. Someone had been here. She could hand the keys to the harbour board, or she could say nothing and watch who came back for the light.",
    variants: [
      ["She stays silent", "Maren climbed the last stair and found the lamp already lit. She touched the glass; it was still warm. She told no one, and waited in the dark below the gallery for footsteps."],
      ["She calls the board", "Maren climbed the last stair and found the lamp already lit. She counted to ten, went back down to the radio, and gave the harbour board the one sentence she had practised for years."],
    ],
    goal: { audience: "Readers of literary short fiction", ageMin: 25, ageMax: 45, styles: "atmospheric, quiet tension", outcome: "Leave readers wanting the next scene", metric: "Narrative resonance" },
  },
};

export function buildProject({ title, type, original, sample }) {
  const o = { id: "original", parentId: null, name: "Original", content: original, isOriginal: true };
  const branches = [o];
  let goal = { audience: "", ageMin: 18, ageMax: 35, styles: "", outcome: "", metric: "" };
  if (sample) {
    sample.variants.forEach(([name, content], i) =>
      branches.push({ id: uid(), parentId: "original", name, content, isOriginal: false, color: COLORS[i] })
    );
    goal = sample.goal;
  }
  return {
    id: uid(), title, type, original, branches,
    selected: sample ? branches.map((b) => b.id) : ["original"],
    goal, result: null, updatedAt: new Date().toISOString(),
  };
}

const PROFILES = {
  social: [
    { fit: "Strong", pct: 82, strengths: ["Opening earns a second line of attention", "Tone matches a practical, learning-minded audience"], risks: ["The payoff may feel smaller than the setup"], reactions: [["Skeptic", "Interesting, but show me the lesson."], ["Newcomer", "This feels written for me."], ["Loyalist", "Sounds like you, good."]] },
    { fit: "Moderate", pct: 61, strengths: ["Very scannable and save-worthy", "Clear promise in the first line"], risks: ["Reads closer to a template", "Less personal voice"], reactions: [["Skeptic", "I have seen this format a lot."], ["Newcomer", "Useful, I will bookmark it."], ["Loyalist", "Less you than usual."]] },
    { fit: "Mixed", pct: 44, strengths: ["Direct and low-effort to read"], risks: ["Generic opening", "Little reason to comment"], reactions: [["Skeptic", "Nothing here is surprising."], ["Newcomer", "Fine, but easy to scroll past."], ["Loyalist", "Pleasant, familiar."]] },
  ],
  story: [
    { fit: "Strong", pct: 80, strengths: ["Sustains tension with a physical detail", "Gives the reader a question to carry"], risks: ["Slower pacing may lose casual readers"], reactions: [["Skeptic", "Earned, but I want a payoff soon."], ["Newcomer", "I am pulled in."], ["Loyalist", "Fits the quiet register."]] },
    { fit: "Moderate", pct: 62, strengths: ["Clear decision and momentum", "Character agency is visible"], risks: ["Resolves tension quickly", "Less atmosphere"], reactions: [["Skeptic", "Efficient, a little neat."], ["Newcomer", "Easy to follow."], ["Loyalist", "Fewer shadows than usual."]] },
    { fit: "Mixed", pct: 46, strengths: ["Faithful to the source scene"], risks: ["Stakes feel implied, not felt"], reactions: [["Skeptic", "Why should I care yet?"], ["Newcomer", "Unclear what is at risk."], ["Loyalist", "Good bones, needs texture."]] },
  ],
};

export function sampleReport(project, ids) {
  const profs = PROFILES[project.type] || PROFILES.social;
  const items = ids.map((id, i) => ({ branchId: id, ...profs[i % profs.length] }));
  return {
    kind: "illustrative-sample",
    generatedAt: new Date().toISOString(),
    items,
    recommendedBranchId: ids[0],
  };
}
