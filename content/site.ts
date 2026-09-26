/** Public, non-secret site content. Everything here is shipped to the browser. */
export type Project = {
  name: string;
  tagline: string;
  url?: string;
  label?: string;
  /** Logo in public/logos (square). Falls back to the letter mark when missing. */
  logo?: string;
  mark: string;
  color: string;
};

export const site = {
  name: "Gabriel",
  fullName: "Gabriel Brument",
  email: "gabriel@mentem.app",
  /** Put a PDF in public/ (for example /resume.pdf) to show the Résumé link. */
  resumeUrl: "",
  links: {
    linkedin: "https://www.linkedin.com/in/gabriel-brument",
    github: "https://github.com/SobshDev",
  },
  /** Files in public/avatar, built with `npm run avatar`. Set animated to false for a still avatar without idle/talking videos. */
  avatar: {
    animated: true,
  },
  title: "Gabriel Brument — ask the agent version of me",
  description:
    "Founder of Mentem. Chat with an AI version of Gabriel about what he's building, what he's shipped, and how he works.",
  suggestions: ["What are you building?", "Walk me through Mentem", "What have you shipped?", "How do you work?"],
  topics: [
    "What are you building?",
    "Walk me through Mentem",
    "What have you shipped?",
    "How do you work?",
    "Tell me about Graphy",
    "What's your stack?",
    "Where did you study?",
    "How can I reach you?",
  ],
  projects: {
    mentem: {
      name: "Mentem",
      tagline: "AI agents that keep running in the cloud. Join the waitlist.",
      url: "https://mentem.app/updates",
      label: "waitlist",
      logo: "/logos/mentem.svg",
      mark: "m",
      color: "#011BD8",
    },
    graphy: {
      name: "Graphy",
      tagline: "1st place, Epitech GenAI hackathon. Your codebase as a graph.",
      url: "https://github.com/SobshDev/Graphy",
      label: "github",
      logo: "/logos/github.svg",
      mark: "g",
      color: "#1F6F54",
    },
    milesto: {
      name: "Milesto",
      tagline: "An AI coach that turns goals into weekly plans.",
      mark: "M",
      color: "#7A3FD1",
    },
    zappy: {
      name: "Zappy",
      tagline: "C++ multiplayer sim with autonomous TCP agents.",
      url: "https://github.com/SobshDev/Zappy",
      label: "github",
      logo: "/logos/github.svg",
      mark: "z",
      color: "#B4541F",
    },
    "ai-usage": {
      name: "AI Usage",
      tagline: "A macOS menu-bar app for coding-agent limits.",
      url: "https://github.com/SobshDev/ai-usage-menubar",
      label: "github",
      logo: "/logos/ai-usage.webp",
      mark: "ai",
      color: "#3A3A40",
    },
  } satisfies Record<string, Project>,
};

export type ProjectId = keyof typeof site.projects;
