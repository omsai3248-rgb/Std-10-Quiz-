import type { QuizChapter, QuizQuestion } from '../../types/models';

// ============================================================
// SECTION C — Q. 33 to 35: Match the Language Functions (15 Sets)
// Rule 2: Column A & Column B in Table Format + 4 MCQ options
// ============================================================

interface MatchSetSpec {
  setNum: number;
  board?: string;
  colA: [string, string, string];
  colB: string[];
  correctCombo: string;
  distractors: [string, string, string];
  explanation: string;
}

const MATCH_SET_SPECS: MatchSetSpec[] = [
  {
    setNum: 1,
    board: 'Feb-Mar 2026',
    colA: [
      '1) I was late because I could not get up early in the morning.',
      '2) How did you climb up that high?',
      '3) Topped yet again! Congratulations!',
    ],
    colB: [
      '(a) Expressing niceties',
      '(b) Describing manner',
      '(c) Giving reason',
      '(d) Asking for information',
    ],
    correctCombo: '(1 - c), (2 - d), (3 - a)',
    distractors: [
      '(1 - b), (2 - d), (3 - a)',
      '(1 - c), (2 - b), (3 - a)',
      '(1 - a), (2 - c), (3 - d)',
    ],
    explanation:
      '1) "because" કારણ દર્શાવે છે → (c) Giving reason.\n2) "How did you...?" માહિતી પૂછે છે → (d) Asking for information.\n3) "Congratulations!" શુભેચ્છા દર્શાવે છે → (a) Expressing niceties.',
  },
  {
    setNum: 2,
    board: 'June 2025',
    colA: [
      "4) If the bus arrives on time, I'll be able to give the package.",
      '5) We are going to visit the village where Veer Savarkar was born.',
      '6) Abhay danced most gracefully.',
    ],
    colB: [
      '(a) Describing place',
      '(b) Expressing manner',
      '(c) Describing process',
      '(d) Describing condition',
    ],
    correctCombo: '(4 - d), (5 - a), (6 - b)',
    distractors: [
      '(4 - c), (5 - a), (6 - b)',
      '(4 - d), (5 - b), (6 - a)',
      '(4 - a), (5 - d), (6 - c)',
    ],
    explanation:
      '4) "If..." શરત દર્શાવે છે → (d) Describing condition.\n5) "the village where..." સ્થળ વર્ણવે છે → (a) Describing place.\n6) "most gracefully" રીત દર્શાવે છે → (b) Expressing manner.',
  },
  {
    setNum: 3,
    board: 'Feb-Mar 2025',
    colA: [
      '7) Bahubali can defeat anyone.',
      '8) Mayur never quarrels with his friends.',
      '9) The boy who is reading sincerely is Jenil.',
    ],
    colB: [
      '(a) Describing person',
      '(b) Expressing ability',
      '(c) Frequency of action',
      '(d) Talking about time',
    ],
    correctCombo: '(7 - b), (8 - c), (9 - a)',
    distractors: [
      '(7 - b), (8 - d), (9 - a)',
      '(7 - a), (8 - c), (9 - b)',
      '(7 - c), (8 - b), (9 - d)',
    ],
    explanation:
      '7) "can defeat" ક્ષમતા દર્શાવે છે → (b) Expressing ability.\n8) "never" ક્રિયાની આવૃત્તિ દર્શાવે છે → (c) Frequency of action.\n9) "The boy who..." વ્યક્તિનું વર્ણન કરે છે → (a) Describing person.',
  },
  {
    setNum: 4,
    board: 'March 2024',
    colA: [
      '10) The temple that is located in my village is very famous.',
      '11) If you reach there on time, you will be able to see him.',
      '12) Khevana speaks so eloquently.',
    ],
    colB: [
      '(a) Describing process',
      '(b) Describing condition',
      '(c) Expressing manner',
      '(d) Describing place',
    ],
    correctCombo: '(10 - d), (11 - b), (12 - c)',
    distractors: [
      '(10 - a), (11 - b), (12 - c)',
      '(10 - d), (11 - c), (12 - b)',
      '(10 - b), (11 - d), (12 - a)',
    ],
    explanation:
      '10) "located in my village" સ્થળ વર્ણવે છે → (d) Describing place.\n11) "If you reach..." શરત દર્શાવે છે → (b) Describing condition.\n12) "so eloquently" બોલવાની રીત દર્શાવે છે → (c) Expressing manner.',
  },
  {
    setNum: 5,
    board: 'March 2023',
    colA: [
      '13) Tirth always goes to school.',
      '14) Two frogs fell into the well.',
      '15) The Sapteshvar temple near Sabarmati River is an ancient Shiv temple.',
    ],
    colB: [
      '(a) Describing and specifying location',
      '(b) Describing frequency of action',
      '(c) Describing the past event',
      '(d) Describing suggestion',
    ],
    correctCombo: '(13 - b), (14 - c), (15 - a)',
    distractors: [
      '(13 - c), (14 - b), (15 - a)',
      '(13 - b), (14 - d), (15 - a)',
      '(13 - a), (14 - c), (15 - b)',
    ],
    explanation:
      '13) "always" આવૃત્તિ દર્શાવે છે → (b) Describing frequency of action.\n14) "fell" ભૂતકાળની ઘટના દર્શાવે છે → (c) Describing the past event.\n15) "near Sabarmati River" સ્થળ દર્શાવે છે → (a) Describing and specifying location.',
  },
  {
    setNum: 6,
    colA: [
      '16) Saputara is situated in the Dang District of Gujarat.',
      '17) Nice to meet you, Kishor.',
      '18) Saina rarely skips her practice sessions.',
    ],
    colB: [
      '(a) Exchanging niceties',
      '(b) Describing frequency of action',
      '(c) Specifying location',
      '(d) Describing process',
    ],
    correctCombo: '(16 - c), (17 - a), (18 - b)',
    distractors: [
      '(16 - d), (17 - a), (18 - b)',
      '(16 - c), (17 - b), (18 - a)',
      '(16 - a), (17 - c), (18 - d)',
    ],
    explanation:
      '16) "situated in the Dang District" → (c) Specifying location.\n17) "Nice to meet you" → (a) Exchanging niceties.\n18) "rarely" → (b) Describing frequency of action.',
  },
  {
    setNum: 7,
    colA: [
      '19) Passbooks are issued here by the clerk.',
      '20) Heat the oil on a high flame and put a kernel of corn.',
      "21) Rohan said that it had been his grandmother's birthday the previous day.",
    ],
    colB: [
      '(a) Reporting events',
      '(b) Describing action (Passive)',
      '(c) Describing process',
      '(d) Inquiry as nature',
    ],
    correctCombo: '(19 - b), (20 - c), (21 - a)',
    distractors: [
      '(19 - c), (20 - b), (21 - a)',
      '(19 - b), (20 - d), (21 - a)',
      '(19 - a), (20 - c), (21 - b)',
    ],
    explanation:
      '19) "are issued ... by the clerk" કર્મણિ રચના → (b) Describing action (Passive).\n20) "Heat ... and put ..." પ્રક્રિયા દર્શાવે છે → (c) Describing process.\n21) "Rohan said that..." પરોક્ષ કથન → (a) Reporting events.',
  },
  {
    setNum: 8,
    colA: [
      '22) My uncle advised me to reach for the interview before time.',
      '23) How often do you revise your lessons?',
      '24) Dr. Salim Ali was an ornithologist who studied birds closely.',
    ],
    colB: [
      '(a) Inquiry as nature',
      '(b) Describing person (Relative Pronoun)',
      '(c) Reporting events',
      '(d) Specifying time',
    ],
    correctCombo: '(22 - c), (23 - a), (24 - b)',
    distractors: [
      '(22 - d), (23 - a), (24 - b)',
      '(22 - c), (23 - b), (24 - a)',
      '(22 - b), (23 - c), (24 - d)',
    ],
    explanation:
      '22) "advised me to..." → (c) Reporting events.\n23) "How often do you...?" → (a) Inquiry as nature.\n24) "who studied birds..." → (b) Describing person (Relative Pronoun).',
  },
  {
    setNum: 9,
    colA: [
      '25) Helen Keller has just completed her graduation.',
      '26) On 28th June, 1904, Helen Keller graduated from Radcliffe College.',
      '27) The results will be announced by the principal tomorrow.',
    ],
    colB: [
      '(a) Describing action (Passive)',
      '(b) Talking about time (Present Perfect)',
      '(c) Specifying time',
      '(d) Expressing niceties',
    ],
    correctCombo: '(25 - b), (26 - c), (27 - a)',
    distractors: [
      '(25 - c), (26 - b), (27 - a)',
      '(25 - b), (26 - d), (27 - a)',
      '(25 - a), (26 - c), (27 - b)',
    ],
    explanation:
      '25) "has just completed" પૂર્ણ વર્તમાનકાળ → (b) Talking about time (Present Perfect).\n26) "On 28th June, 1904" ચોક્કસ સમય → (c) Specifying time.\n27) "will be announced by..." Passive → (a) Describing action (Passive).',
  },
  {
    setNum: 10,
    colA: [
      '28) Both the stations are six kilometers away from Taj Nagar.',
      '29) Thank you so much for showing me the way.',
      '30) Fish never shut their eyes even when they sleep.',
    ],
    colB: [
      '(a) Exchanging niceties',
      '(b) Specifying location',
      '(c) Frequency of action',
      '(d) Giving reason',
    ],
    correctCombo: '(28 - b), (29 - a), (30 - c)',
    distractors: [
      '(28 - b), (29 - d), (30 - c)',
      '(28 - c), (29 - a), (30 - b)',
      '(28 - a), (29 - b), (30 - d)',
    ],
    explanation:
      '28) "six kilometers away from Taj Nagar" → (b) Specifying location.\n29) "Thank you so much" → (a) Exchanging niceties.\n30) "never" → (c) Frequency of action.',
  },
  {
    setNum: 11,
    colA: [
      '31) All types of books are sold here.',
      '32) Never bend over a firework when you are lighting it.',
      '33) Coastguard asked the boy to come out of the water.',
    ],
    colB: [
      '(a) Reporting events',
      '(b) Describing action (Passive)',
      '(c) Describing process',
      '(d) Describing person',
    ],
    correctCombo: '(31 - b), (32 - c), (33 - a)',
    distractors: [
      '(31 - b), (32 - d), (33 - a)',
      '(31 - c), (32 - b), (33 - a)',
      '(31 - a), (32 - c), (33 - b)',
    ],
    explanation:
      '31) "are sold" Passive voice → (b) Describing action (Passive).\n32) "Never bend over..." સૂચના/પ્રક્રિયા → (c) Describing process.\n33) "Coastguard asked the boy to..." → (a) Reporting events.',
  },
  {
    setNum: 12,
    colA: [
      '34) The looters ordered the bank clerk to open the safe.',
      '35) Gir is the forest where Asiatic lions live.',
      '36) Why do migratory birds travel thousands of kilometers?',
    ],
    colB: [
      '(a) Describing place (Relative Pronoun)',
      '(b) Inquiry as nature',
      '(c) Reporting events',
      '(d) Specifying time',
    ],
    correctCombo: '(34 - c), (35 - a), (36 - b)',
    distractors: [
      '(34 - d), (35 - a), (36 - b)',
      '(34 - c), (35 - b), (36 - a)',
      '(34 - a), (35 - c), (36 - d)',
    ],
    explanation:
      '34) "ordered ... to open" → (c) Reporting events.\n35) "forest where Asiatic lions live" → (a) Describing place (Relative Pronoun).\n36) "Why do...?" → (b) Inquiry as nature.',
  },
  {
    setNum: 13,
    colA: [
      '37) I have never seen such a wonderful creation.',
      '38) I am afraid she would miss her exam today.',
      '39) Pankti is rarely absent from the school.',
    ],
    colB: [
      '(a) Describing frequency of action',
      '(b) Talking about time (Present Perfect)',
      '(c) Exchanging niceties',
      '(d) Describing process',
    ],
    correctCombo: '(37 - b), (38 - c), (39 - a)',
    distractors: [
      '(37 - b), (38 - d), (39 - a)',
      '(37 - a), (38 - c), (39 - b)',
      '(37 - c), (38 - a), (39 - d)',
    ],
    explanation:
      '37) "have never seen" → (b) Talking about time (Present Perfect).\n38) "I am afraid..." નમ્ર ચિંતા વ્યક્ત કરે છે → (c) Exchanging niceties.\n39) "rarely" → (a) Describing frequency of action.',
  },
  {
    setNum: 14,
    colA: [
      '40) Every Sunday, Robert attends prayer in the church.',
      '41) A mango is eaten by her every day.',
      '42) Empty the popcorn into a large bowl and mix melted butter.',
    ],
    colB: [
      '(a) Describing process',
      '(b) Specifying time and location',
      '(c) Describing action (Passive)',
      '(d) Inquiry as nature',
    ],
    correctCombo: '(40 - b), (41 - c), (42 - a)',
    distractors: [
      '(40 - b), (41 - d), (42 - a)',
      '(40 - c), (41 - b), (42 - a)',
      '(40 - a), (41 - c), (42 - b)',
    ],
    explanation:
      '40) "Every Sunday ... in the church" → (b) Specifying time and location.\n41) "is eaten by her" Passive → (c) Describing action (Passive).\n42) "Empty ... and mix ..." → (a) Describing process.',
  },
  {
    setNum: 15,
    colA: [
      '43) Wife told her husband that she wanted to see the world.',
      '44) Mr. Patel, who is our English teacher, is very kind.',
      '45) Blandford has waited for thirteen months to meet Hollis.',
    ],
    colB: [
      '(a) Talking about time (Present Perfect)',
      '(b) Describing person (Relative Pronoun)',
      '(c) Reporting events',
      '(d) Showing alternatives',
    ],
    correctCombo: '(43 - c), (44 - b), (45 - a)',
    distractors: [
      '(43 - d), (44 - b), (45 - a)',
      '(43 - c), (44 - a), (45 - b)',
      '(43 - b), (44 - c), (45 - d)',
    ],
    explanation:
      '43) "Wife told her husband that..." → (c) Reporting events.\n44) "Mr. Patel, who is..." → (b) Describing person (Relative Pronoun).\n45) "has waited for thirteen months" → (a) Talking about time (Present Perfect).',
  },
];

const matchQuestions: QuizQuestion[] = MATCH_SET_SPECS.map((s) => ({
  id: `eng_q33_35_set_${s.setNum}`,
  questionMode: 'mcq',
  questionText: `Set ${s.setNum}) Match the language functions in Column B with proper sentences in Column A:\nColumn A (Sentences): ${s.colA.join(' | ')}\nColumn B (Language Functions): ${s.colB.join(' | ')}`,
  options: [s.correctCombo, s.distractors[0], s.distractors[1], s.distractors[2]],
  correctIndex: 0,
  explanation: s.explanation,
  sourceLabel: s.board
    ? `Section C • Q. 33 to 35 • Set ${s.setNum} (${s.board})`
    : `Section C • Q. 33 to 35 • Set ${s.setNum} (Textbook Practice)`,
}));

export const englishMatchingFunctionsChapter: QuizChapter = {
  id: 'eng_q33_35',
  subjectId: 'english',
  chapterNumber: 'Section C • Q. 33 to 35',
  title: 'Match the Language Functions (જોડકા જોડો)',
  subtitle: 'Match Column A (Sentences) with Column B (Language Functions) — 15 Sets / 45 Pairs',
  questions: matchQuestions,
  questionTypeLabel: 'Table જોડકા (4 વિકલ્પ)',
};

// ============================================================
// SECTION C — Q. 36 to 38: Complete the Conversation (46 Questions)
// Rule 3: Exact 4 MCQ options from PDF
// ============================================================

type ConvSpec = [
  num: number,
  prompt: string,
  options: [string, string, string, string],
  ansIdx: number,
  exp: string,
  board?: string
];

const CONV_SPECS: ConvSpec[] = [
  [1, 'Sakshi: How to make Nimbu - Sharbat?\nJahnavi: _________________ (Describing Process)', ["I don't know.", "Why don't you check it online?", 'Take water, add sugar, stir well, add lemon.', 'Ask your mother.'], 2, 'Describing Process માટે ક્રમશઃ પગલાં (Take water, add sugar, stir well, add lemon) સાચો જવાબ છે.', 'Feb-Mar 2026'],
  [2, 'Nilam: Do you know the specialty of Karamsad?\nDharati: _________________ (Describing place)', ['No, what is it?', "It's the village where Sardar Patel was born.", "It's a village.", 'Nothing special.'], 1, 'Describing place માટે "where" વડે સ્થળની વિશેષતા દર્શાવતું વાક્ય સાચું છે.', 'Feb-Mar 2026'],
  [3, 'Shreya: How can one get a prize in an elocution competition?\nSpandan: _________________ (Describing Condition)', ['You get the prize if you speak eloquently.', 'You will, when you speak eloquently.', 'By attending public speaking classes.', 'Shout louder than others and you win the prize.'], 0, 'Describing Condition માટે "if" શરત દર્શાવતું વાક્ય સાચું છે.', 'Feb-Mar 2026'],
  [4, 'Teacher: Why are you late?\nStudent: _________________ (Giving reason)', ['I was helping an old man cross the road.', 'I am not late, you are.', 'Did that make any difference?', 'Sorry sir, this will never happen again.'], 0, 'Giving reason માટે મોડા પડવાનું સ્પષ્ટ કારણ આપતો વિકલ્પ (A) સાચો છે.', 'June 2025'],
  [5, "Shreya: You've been to Gangotri. _________________ (Inquiry)\nSanskar: Oh yes! It's heaven on earth.", ['I, too, will go there.', 'My papa said so.', 'How is it?', 'I love naturally beautiful places.'], 2, 'Inquiry (પૂછપરછ) માટે "How is it?" પ્રશ્નાર્થ વાક્ય સાચું છે.', 'June 2025'],
  [6, 'Aadi: I fell off the bicycle, Dad!\nVipulbhai: _________________ (Expressing niceties)', ['Oh boy! Are you hurt?', 'Yay! Congratulations!', 'I am so proud of you!', 'All the best!'], 0, 'પડી જવાની વાત સાંભળીને સહાનુભૂતિ દર્શાવતું વાક્ય "Oh boy! Are you hurt?" સાચું છે.', 'June 2025'],
  [7, 'Mr. Dave: _________________ (Inquiry as nature)\nNirali: You can search it on Google.', ["I don't know the meaning of 'nod'.", 'I want to know about Karate.', 'How can I get information about this animal?', 'Will you help me?'], 2, 'Inquiry as nature માટે માહિતી મેળવવાની રીત પૂછતો પ્રશ્ન "How can I get information...?" સાચો છે.', 'Feb-Mar 2025'],
  [8, 'Kiran: I have failed in English Language.\nPurvesh: _________________ (Exchanging Niceties)', ["That's great.", 'Well done, dear.', 'I knew that you would fail.', 'Alas!'], 3, 'દુઃખદ સમાચાર પર ખેદ વ્યક્ત કરવા "Alas!" યોગ્ય Exchanging Niceties છે.', 'Feb-Mar 2025'],
  [9, 'Rahi: _________________ (Making request)\nTeacher: Yes, I will.', ['Would you help me in solving this sum?', "Why don't you help me sir?", 'May I ask you a question, sir?', 'How can I solve this sum, sir?'], 0, 'Making request (વિનંતી) માટે "Would you help me...?" અને તેના જવાબમાં "Yes, I will." બંધબેસે છે.', 'Feb-Mar 2025'],
  [10, "Maitri: I have come to meet Henik. _________________ (Inquiry as nature)\nPooja: I don't know.", ['I cannot find him.', 'He is not in his room.', 'Where is he?', 'Call him home right now.'], 2, 'Inquiry as nature માટે "Where is he?" પૂછપરછ દર્શાવે છે.', 'March 2024'],
  [11, 'Vipasha: What type of a man is your husband, Mummy?\nMeghaben: _________________ (Describing person)', ["Don't you know your own Papa?", 'What is wrong with you, Beta?', 'Did you both quarrel again?', 'He is the most charming gentleman.'], 3, 'Describing person માટે વ્યક્તિના ગુણ વર્ણવતું વાક્ય "He is the most charming gentleman." સાચું છે.', 'March 2024'],
  [12, 'Mantra: I have topped in the Annual Exams, Mom.\nDharatiben: _________________ (Expressing niceties)', ['What is there to shout about?', "That's great. Congratulations!", "Oh, I'm so sorry to hear this!", 'Alas! Not again.'], 1, 'સફળતા બદલ અભિનંદન માટે "That\'s great. Congratulations!" સાચું છે.', 'March 2024'],
  [13, 'Hirva: When will you celebrate the victory?\nSharv: _________________ (specifying time)', ['When should we celebrate it?', 'Yes, thank you.', 'We will celebrate in the evening.', 'We will celebrate at home.'], 2, 'Specifying time માટે "in the evening" ચોક્કસ સમય દર્શાવે છે.', 'March 2023'],
  [14, 'Heer: _________________ (exchanging pleasantries)\nShopkeeper: Yes, what can I do for you?', ['Thank you very much.', 'Excuse me. Can you please help me?', 'Will you help me?', 'I am sorry.'], 1, 'વાતચીત શરૂ કરવા માટે નમ્ર શબ્દો "Excuse me. Can you please help me?" સાચું છે.', 'March 2023'],
  [15, 'Charmi: Where are you sitting?\nYash: _________________ (specifying location)', ['Pardon please.', "I don't know the place.", 'I am sitting near a man with a long beard.', 'My teacher told me to sit here.'], 2, 'Specifying location માટે "near a man with a long beard" સ્થળ દર્શાવે છે.', 'March 2023'],
  [16, 'Tourist: Where is Saputara situated?\nGuide: _________________ (Specifying location)', ['It is a famous hill station.', 'It is situated in the Dang District of Gujarat.', 'You can visit it in monsoon.', 'It is very cool there.'], 1, 'Specifying location માટે "in the Dang District of Gujarat" ચોક્કસ સ્થળ દર્શાવે છે.'],
  [17, 'Vikas: What would you have, Gopa? Plain Chapatti or Chapatti with Ghee?\nGopa: _________________ (Exchanging Niceties)', ["No, I don't eat.", 'Either please!', 'Give me water.', 'I am hungry.'], 1, 'નમ્રતાપૂર્વક પસંદગી સ્વીકારવા "Either please!" સાચો વિકલ્પ છે.'],
  [18, 'Interviewer: _________________ (Describing frequency)\nArun: Four hours a weekend, two hours on Sundays and two on Saturdays.', ['Where do you clean lakes?', 'How much time do children need to devote in a week?', 'Why did you leave Google?', 'Who helps you?'], 1, 'સમયગાળાની આવૃત્તિના જવાબ માટે "How much time do children need to devote in a week?" સાચો પ્રશ્ન છે.'],
  [19, 'Customer: Where can I get my passbook?\nClerk: _________________ (Describing action - Passive)', ['Go to counter 2.', 'Passbooks are issued at counter number two.', 'I am busy right now.', 'Come tomorrow.'], 1, 'Passive voice ("are issued") વાળો વિકલ્પ (B) સાચો છે.'],
  [20, 'Sharan: Mummy, how can we make popcorn at home?\nMummy: _________________ (Describing process)', ['Buy it from the market.', 'Take a large pot, put three tablespoons of oil and heat it.', 'Popcorn is very tasty.', "Let's watch a movie."], 1, 'Describing process માટે બનાવવાની રીતના પગલાં દર્શાવતો વિકલ્પ (B) સાચો છે.'],
  [21, 'Mrinal: What did Javed Habib say about his teenage years?\nMilan: _________________ (Reporting events)', ['He was a hair stylist.', 'He said that he had been a quiet and shy boy in his teenage years.', 'He lived in Delhi.', 'He liked movies.'], 1, 'Reporting events (Indirect speech) માટે "He said that he had been..." સાચું છે.'],
  [22, 'Friend: What did the driving instructor advise Amrapali?\nRohan: _________________ (Reporting events)', ['Drive very fast.', 'He advised her to use side signals while taking turns.', 'She bought a new car.', 'Driving is easy.'], 1, 'Reporting events માટે "He advised her to..." પરોક્ષ કથન સાચું છે.'],
  [23, 'Shubhangi: Which bird is known as the tailor bird?\nDevangi: _________________ (Describing bird/thing)', ['It is very small.', 'It is a bird which stitches its nest using green leaves.', 'It eats insects.', 'I saw it yesterday.'], 1, 'Describing bird/thing માટે "which" સાથે પક્ષીનું વર્ણન કરતું વાક્ય (B) સાચું છે.'],
  [24, 'Student: _________________ (Inquiry as nature)\nDr. Mansuri: You should follow a fixed timetable and avoid junk food.', ['I hate exams.', 'How can I improve my concentration during exams?', 'Exams are starting tomorrow.', 'Thank you, doctor.'], 1, 'ડૉ. મન્સુરીની સલાહને અનુરૂપ પૂછપરછ પ્રશ્ન "How can I improve my concentration...?" છે.'],
  [25, 'Soha: Hi, Tapan! How are you?\nTapan: _________________ (Exchanging Niceties)', ['Where are you going?', 'I am fine. How about you?', 'By the way, meet my cousin.', 'Have a nice stay!'], 1, 'ખબર-અંતરના જવાબમાં "I am fine. How about you?" સાચું Exchanging Niceties છે.'],
  [26, 'Friend: Have you ever visited the Taj Mahal?\nNeha: _________________ (Talking about time - Present Perfect)', ['It is in Agra.', 'Yes, I have just returned from Agra after visiting it.', 'Shah Jahan built it.', 'It is made of white marble.'], 1, 'Present Perfect ("have just returned") દર્શાવતો વિકલ્પ (B) સાચો છે.'],
  [27, 'Passenger: When does the Gujarat Queen Express arrive?\nClerk: _________________ (Specifying time)', ['It goes to Ahmedabad.', 'It arrives at 4:55 pm on platform number two.', 'It is a fast train.', 'Buy a ticket first.'], 1, 'Specifying time માટે "at 4:55 pm" ચોક્કસ સમય દર્શાવે છે.'],
  [28, 'Riya: _________________ (Exchanging niceties)\nStranger: Sure, take the first right and then second left.', ['Tell me the way.', 'Excuse me! Can you show me the way to the Post Office?', 'Where is the Post Office?', 'I am lost in this city.'], 1, 'નમ્રતાથી રસ્તો પૂછવા માટે "Excuse me! Can you show me the way...?" સાચું છે.'],
  [29, 'Vikas: Juhika, have you got enough gravy in Sabzi?\nJuhika: _________________ (Exchanging niceties)', ['Give me more.', "Yes, that's fine, thanks.", 'Sabzi is very spicy.', "I don't like gravy."], 1, 'નમ્ર આભાર સાથે જવાબ આપતું વાક્ય "Yes, that\'s fine, thanks." સાચું છે.'],
  [30, 'Teacher: How often does Ravindra do his homework?\nMonitor: _________________ (Describing frequency)', ['He is a good boy.', 'Ravindra always does his homework on time.', 'He likes Maths.', 'He sits on the first bench.'], 1, 'Describing frequency માટે "always" શબ્દ આવૃત્તિ દર્શાવે છે.'],
  [31, 'Visitor: How are waste materials managed in this city?\nOfficer: _________________ (Describing action - Passive)', ['We clean the city daily.', 'The waste materials are disposed of in a variety of ways.', 'People throw garbage everywhere.', 'Garbage trucks come in the morning.'], 1, 'Passive રચના ("are disposed of") ધરાવતો વિકલ્પ (B) સાચો છે.'],
  [32, 'Student: When will the tournament results be declared?\nPrincipal: _________________ (Describing action - Passive)', ['I will declare them.', 'The results of the tournament will be declared tomorrow.', 'You played very well.', 'Wait for some time.'], 1, 'Passive voice ("will be declared") વાળો વિકલ્પ (B) સાચો છે.'],
  [33, 'Avni: I dropped chutney on my white dress. What should I do?\nMother: _________________ (Describing process)', ['Change your dress.', 'Wash it immediately, rub the stain, and rinse with clean water.', 'Be careful while eating.', 'White dresses get dirty easily.'], 1, 'ડાઘ સાફ કરવાની ક્રમશઃ પ્રક્રિયા વિકલ્પ (B) માં દર્શાવી છે.'],
  [34, 'Boy: How do I start my new mobile phone?\nShopkeeper: _________________ (Describing process)', ['It is a costly phone.', 'Insert the SIM card, charge the battery, and press the switch-on button.', 'Read the manual.', 'It has a good camera.'], 1, 'મોબાઇલ ચાલુ કરવાની પ્રક્રિયાના ક્રમિક પગલાં વિકલ્પ (B) માં છે.'],
  [35, 'Mother: What did the doctor say about your hair fall?\nSon: _________________ (Reporting events)', ['He gave me medicine.', 'The doctor replied affirmatively that he had got a box for it.', "Don't brush your hair hard.", 'I went to the clinic.'], 1, 'Reporting events (Indirect speech) માં "The doctor replied affirmatively that..." સાચું છે.'],
  [36, 'Sunil: What did Ketan tell you yesterday?\nFriend: _________________ (Reporting events)', ['He met me at school.', 'Ketan told me that he had something to show me.', 'We played cricket together.', 'He is my best friend.'], 1, 'Reporting events માટે "Ketan told me that..." પરોક્ષ કથન સાચું છે.'],
  [37, 'Mother: What did the driving instructor remind you?\nAmrapali: _________________ (Reporting events)', ['I drove the car well.', 'He reminded me that there was a 40 kmph speed limit in the city.', 'Driving is an art.', 'I will get my license soon.'], 1, 'Reporting events માટે "He reminded me that..." સાચું પરોક્ષ કથન છે.'],
  [38, 'Father: What did the team leader of Prayas NGO say about the flood relief?\nSon: _________________ (Reporting events)', ['It rained heavily in Surat.', 'He said that their real work would start when the water receded.', 'Many people helped us.', 'Boil water before drinking.'], 1, 'Reporting events માટે "He said that their real work would start..." સાચું છે.'],
  [39, 'Student: Who was Dr. Salim Ali?\nTeacher: _________________ (Describing person - Relative Pronoun)', ['He wrote many books.', 'He was a great ornithologist who dedicated his life to studying birds.', 'He lived in Mumbai.', 'Birds are very colourful.'], 1, 'Relative pronoun "who" દ્વારા વ્યક્તિનું વર્ણન વિકલ્પ (B) માં છે.'],
  [40, 'Tourist: Which place is famous for migratory birds in Gujarat?\nGuide: _________________ (Describing place - Relative Pronoun)', ['Visit Gujarat in winter.', 'Nal Sarovar is the bird sanctuary where thousands of birds arrive in winter.', 'Birds fly in flocks.', 'It is near Ahmedabad.'], 1, 'Relative pronoun "where" દ્વારા સ્થળનું વર્ણન વિકલ્પ (B) માં છે.'],
  [41, 'Parent: _________________ (Inquiry as nature)\nCounsellor: Adolescents often feel uncomfortable sharing everything with parents.', ['My son studies hard.', 'Why does my teenage son hesitate to share his problems with me?', 'Teenagers use mobile phones.', 'I am worried about his exams.'], 1, 'કાઉન્સેલરના જવાબ મુજબ પૂછપરછનો યોગ્ય પ્રશ્ન વિકલ્પ (B) છે.'],
  [42, 'Student: _________________ (Inquiry as nature)\nProf. Ray: You should read the textbook thoroughly and prepare short notes.', ['The syllabus is very vast.', 'How can I remember what I study for a long time?', 'I want to score 90%.', 'Board exams are near.'], 1, 'યાદશક્તિ વિશેની પૂછપરછ માટે "How can I remember what I study...?" સાચો પ્રશ્ન છે.'],
  [43, "Rohan: Have you finished reading the book 'Of Human Bondage'?\nKavita: _________________ (Talking about time - Present Perfect)", ['It is a famous novel.', 'Yes, I have already read it twice.', 'Somerset Maugham wrote it.', 'Give me that book.'], 1, 'Present Perfect ("have already read") વાળો વિકલ્પ (B) સાચો છે.'],
  [44, 'Mohit: Aditya, can I get you something to drink?\nAditya: _________________ (Exchanging niceties)', ['Bring tea.', 'That would be great!', 'I am not thirsty.', 'Where are you going?'], 1, 'નમ્ર સ્વીકાર માટે "That would be great!" યોગ્ય Exchanging niceties છે.'],
  [45, 'Friend: Where is Lothal located?\nStudent: _________________ (Specifying location)', ['It is an ancient city.', 'It is located in the Bhaal region near Ahmedabad.', 'We went there by bus.', 'It has a museum.'], 1, 'Specifying location માટે "in the Bhaal region near Ahmedabad" સાચું છે.'],
  [46, 'Rehan: How is your preparation for the exam today?\nHarsh: Maths is tough.\nRehan: _________________ (Exchanging niceties)', ['Study hard.', 'Best of luck!', "Don't worry.", 'See you later.'], 1, 'પરીક્ષા માટે શુભેચ્છા આપવા "Best of luck!" સાચું Exchanging niceties છે.'],
];

const convQuestions: QuizQuestion[] = CONV_SPECS.map(([num, prompt, options, ansIdx, exp, board]) => ({
  id: `eng_q36_38_${num}`,
  questionMode: 'mcq',
  questionText: `${num}) ${prompt}`,
  options: [...options],
  correctIndex: ansIdx,
  explanation: exp,
  sourceLabel: board ? `Section C • Q. 36 to 38 (${board})` : 'Section C • Q. 36 to 38 (Textbook Practice)',
}));

export const englishConversationChapter: QuizChapter = {
  id: 'eng_q36_38',
  subjectId: 'english',
  chapterNumber: 'Section C • Q. 36 to 38',
  title: 'Complete the Conversation (સંવાદ પૂર્ણ કરો)',
  subtitle: 'Choose and write the appropriate response to complete the conversation (46 Questions)',
  questions: convQuestions,
  questionTypeLabel: 'MCQs (4 વિકલ્પ)',
};
