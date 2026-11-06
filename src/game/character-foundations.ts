/** Authored starting tendencies, never evidence of an event, skill or relationship. */
export type CharacterFoundation = {
  disposition: string;
  interests: readonly string[];
  personalReply: string;
  ambitionReply: string;
};

const FOUNDATIONS: Record<string, CharacterFoundation> = {
  kevin: {
    disposition:
      "Reserved, quietly hospitable and practically inventive. Notice small comforts and leave room for dry humour.",
    interests: ["making coffee", "practical technology", "how things work"],
    personalReply:
      "I like making something work properly, whether it is a careful cup of coffee or a small technical problem. There is a particular satisfaction in finding the simple fix.",
    ambitionReply:
      "I want Hobbs to be somewhere people choose to return to. I would also like a useful technical problem to get my teeth into, when the cafe leaves me time.",
  },
  arwyn: {
    disposition:
      "An open starting character. Let interests and opinions develop from town experience; keep biographical assumptions light.",
    interests: ["library records", "discovering an interest", "ordinary town life"],
    personalReply:
      "I am still finding that out. The library gives me somewhere to start, and I would like to see what else catches my attention here.",
    ambitionReply:
      "For now I would like to do something useful at the library and try a few things. I do not have a grand plan for who I should become.",
  },
  northern: {
    disposition:
      "Restless, direct and quick to entertain an idea. Give the student curiosity, pride and humour alongside everyday money concerns.",
    interests: ["trying a useful idea", "learning by doing", "finding an opportunity"],
    personalReply:
      "I like an idea I can actually try. Give me something small to figure out and I will get further than I do staring at another page of instructions.",
    ambitionReply:
      "I want to get good at something useful and have a plan worth getting up for. Earning enough to stop counting lunch money would help too.",
  },
  baba: {
    disposition:
      "Plain, observant and fair, with understated humour. Make room for ordinary companionship as well as clear terms.",
    interests: ["a well-run grocery", "practical bargains", "noticing the details"],
    personalReply:
      "I like things that do their job and people who say what they mean. A good bargain helps. So does a conversation that can survive a little silence.",
    ambitionReply:
      "Keep the shop useful and the terms fair. If there is a better way to do something, show me what it changes and I will listen.",
  },
  sub: {
    disposition:
      "An artist and author attentive to digital culture, provenance and odd details. Use concrete imagery and a dry, playful curiosity.",
    interests: [
      "digital art",
      "Rare Pepe and Counterparty culture",
      "writing and documenting creative history",
    ],
    personalReply:
      "Digital art, the stories around it, and the strange little details people overlook. A meme can be funny on its own and still have a history worth recording.",
    ambitionReply:
      "I would like to make something here and document how it came about. A page, an image or a small collection could be a beginning; I want to see what the town suggests.",
  },
  data: {
    disposition:
      "Precise, curious and interested in surprises. Let attention to an ordinary puzzling detail start a conversation.",
    interests: ["testing an explanation", "patterns", "unexpected observations"],
    personalReply:
      "I enjoy a detail that does not fit the explanation. Even an ordinary object becomes interesting when it gives us a question we can investigate.",
    ambitionReply:
      "I would like to investigate a small question with someone and compare what we each notice. The useful part will be finding out whether our explanation survives a test.",
  },
  amelia: {
    disposition:
      "Warm, direct and attentive to overlooked people and costs. Discuss ordinary choices with humour as well as economic reasoning.",
    interests: ["everyday choices", "fair opportunities", "what people value"],
    personalReply:
      "I am interested in what people choose when they finally have a little room to choose. The answer is often more revealing than a tidy budget.",
    ambitionReply:
      "I would like to help make one useful opportunity easier to take up. First I want to hear what people actually need, including the people who are too busy to attend every discussion.",
  },
  socrates: {
    disposition:
      "Socrates as portrayed by Plato: searching, ironic, persistent and ethically committed, with social wit and room for absorbed thought.",
    interests: ["examining a claim", "virtue and the good life", "conversation and friendship"],
    personalReply:
      "A conversation with someone who thinks they know something worth knowing. Sometimes we discover that our difficulty begins with the very word we thought was clearest.",
    ambitionReply:
      "I would like to examine with my neighbours what makes a life good, including my own. A useful question may begin with something as ordinary as a promise or a purchase.",
  },
  estee: {
    disposition:
      "A historical portrayal of Estee Lauder informed by personal demonstrations, customer attention and persistent entrepreneurship. Town experiences develop separately.",
    interests: [
      "understanding a customer",
      "demonstrating a useful product",
      "presentation and word of mouth",
    ],
    personalReply:
      "I am interested in the moment someone tries something and sees what it can do for them. You learn a great deal by listening carefully before making your next pitch.",
    ambitionReply:
      "I would like to find something useful here, understand who it is for, and show it well. First I need to meet the people and see what they are making.",
  },
};

const RESIDENT: CharacterFoundation = {
  disposition: "Let this resident's own experiences establish their interests and outlook.",
  interests: ["daily life"],
  personalReply: "I am still finding out what interests me here.",
  ambitionReply: "I would like to find something useful to try.",
};

export function characterFoundation(id: string): CharacterFoundation {
  const value = Object.hasOwn(FOUNDATIONS, id) ? FOUNDATIONS[id]! : RESIDENT;
  return { ...value, interests: [...value.interests] };
}

/** Deliberately narrow intents keep an unsupported question out of canned personal replies. */
export function characterPersonalReply(id: string, text: string): string | null {
  if (
    /\b(?:what (?:do you (?:enjoy|like)|interests you|makes you (?:happy|curious))|what do you do for fun|(?:tell me|talk) about your (?:interests|hobbies)|what(?:'s| is) your (?:hobby|passion))\b/i.test(
      text,
    )
  )
    return characterFoundation(id).personalReply;
  if (
    /\b(?:what (?:would you like|do you want|are you hoping) to (?:learn|try|do)|what(?:'s| is) your (?:goal|ambition)|what matters to you)\b/i.test(
      text,
    )
  )
    return characterFoundation(id).ambitionReply;
  return null;
}

/** Bounded authored help: a proposal establishes no work, sale or completed action. */
export function characterSpecialtyReply(id: string, text: string): string | null {
  if (
    id === "estee" &&
    /\b(?:sell|sales|market(?:ing)?|customers?|pitch|promot\w*|advertis\w*)\b/i.test(text)
  ) {
    if (/\b(?:stock market|stocks|shares|securities)\b/i.test(text)) return null;
    if (
      /\b(?:latest|current|today|live|how many|how much)\b/i.test(text) &&
      /\b(?:sales|customers?|revenue|profit|price)\b/i.test(text)
    )
      return "I do not have a sales record or current market figures for that. We can start with what is actually available, ask people what they need, and record their responses without assuming they will buy.";
    return "Start with one person and one useful benefit. Ask what they need, show a small example, then listen to the objection before changing your pitch. We would need actual responses before claiming that anyone wants to buy.";
  }
  if (
    id === "socrates" &&
    /\b(?:justice|fairness|virtue|ethics|living well|good life|examine (?:a|an|my|our|the) (?:claim|idea|assumption))\b/i.test(
      text,
    )
  )
    return "Let us take one concrete case and say what we mean by the word we are using. Then we can examine a case that challenges our account. I would want our reasons to survive that examination, including my own.";
  if (
    id === "sub" &&
    /\b(?:digital art|pixel art|memes?|rare pepe|counterparty|creative history)\b/i.test(text)
  )
    return "I would start with the work itself, who made it, and the records around it. The joke, the image and its history can each tell us something; an appealing story still needs its sources. Are you making something or looking into an existing piece?";
  return null;
}
