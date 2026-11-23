import type { QuizChapter, QuizQuestion, TapFillBlankSpec } from '../../types/models';

// ============================================================
// SECTION D — Q. 47 to 49: Join the Sentences Using Conjunctions (48 Questions)
// Rule 6: 3 options — 3 distinct joined sentences formed using each of the 3 bracketed conjunctions
// ============================================================

type ConjSpec = [
  num: number,
  prompt: string,
  options: [string, string, string],
  ansIdx: number,
  exp: string,
  board?: string
];

const CONJ_SPECS: ConjSpec[] = [
  [1, 'Mantra met his astrologer friend. He can get some advice about his problem. (and, so that, otherwise)', [
    'Mantra met his astrologer friend and he can get some advice about his problem.',
    'Mantra met his astrologer friend so that he can get some advice about his problem.',
    'Mantra met his astrologer friend otherwise he can get some advice about his problem.',
  ], 1, 'હેતુ (purpose) દર્શાવવા માટે "so that" નો ઉપયોગ થાય છે.', 'Feb-Mar 2026'],
  [2, 'Dr. Joshi made a phone call. He discussed about the critical condition of his patient. (and, but, therefore)', [
    'Dr. Joshi made a phone call and discussed about the critical condition of his patient.',
    'Dr. Joshi made a phone call but discussed about the critical condition of his patient.',
    'Dr. Joshi made a phone call therefore he discussed about the critical condition of his patient.',
  ], 0, 'બે સળંગ ક્રિયાઓને જોડવા માટે "and" નો ઉપયોગ સાચો છે.', 'Feb-Mar 2026'],
  [3, 'He ran very fast. He could not win the race. (because, so, though)', [
    'Because he ran very fast, he could not win the race.',
    'He ran very fast, so he could not win the race.',
    'Though he ran very fast, he could not win the race.',
  ], 2, 'વિરોધાભાસ (contrast) દર્શાવવા માટે "Though" નો ઉપયોગ થાય છે.', 'Feb-Mar 2026'],
  [4, 'Chandubha gifted Aman with an encyclopedia. He can get more knowledge about flora and fauna. (and, so that, or)', [
    'Chandubha gifted Aman with an encyclopedia and he can get more knowledge about flora and fauna.',
    'Chandubha gifted Aman with an encyclopedia so that he can get more knowledge about flora and fauna.',
    'Chandubha gifted Aman with an encyclopedia or he can get more knowledge about flora and fauna.',
  ], 1, 'હેતુ (purpose) દર્શાવવા માટે "so that" વપરાય છે.', 'June 2025'],
  [5, "Kavya will go to her Grandma's home in the vacation. She will spend whole summer with her. (and, but, therefore)", [
    "Kavya will go to her Grandma's home in the vacation and spend whole summer with her.",
    "Kavya will go to her Grandma's home in the vacation but spend whole summer with her.",
    "Kavya will go to her Grandma's home in the vacation therefore she will spend whole summer with her.",
  ], 0, 'સળંગ બે ક્રિયાઓ જોડવા માટે "and" વપરાય છે.', 'June 2025'],
  [6, 'It was an urgent call. Rushil could not go there. (though, because, so that)', [
    'Though it was an urgent call, Rushil could not go there.',
    'Because it was an urgent call, Rushil could not go there.',
    'It was an urgent call so that Rushil could not go there.',
  ], 0, 'વિરોધાભાસ દર્શાવવા માટે "Though" નો ઉપયોગ સાચો છે.', 'June 2025'],
  [7, 'Come here. Take this chocolate. (and, so, but)', [
    'Come here and take this chocolate.',
    'Come here so take this chocolate.',
    'Come here but take this chocolate.',
  ], 0, 'બે આજ્ઞાર્થ ક્રિયાઓને જોડવા માટે "and" વપરાય છે.', 'Feb-Mar 2025'],
  [8, "Neeraj Chopra tried his level best. He couldn't achieve the gold medal. (so, or, but)", [
    "Neeraj Chopra tried his level best so he couldn't achieve the gold medal.",
    "Neeraj Chopra tried his level best or he couldn't achieve the gold medal.",
    "Neeraj Chopra tried his level best but he couldn't achieve the gold medal.",
  ], 2, 'વિરોધાભાસી પરિણામ દર્શાવવા માટે "but" વપરાય છે.', 'Feb-Mar 2025'],
  [9, 'The naughty boy played mischief. The teacher punished him. (either..or, so, though)', [
    'Either the naughty boy played mischief or the teacher punished him.',
    'The naughty boy played mischief, so the teacher punished him.',
    'Though the naughty boy played mischief, the teacher punished him.',
  ], 1, 'પરિણામ (result) દર્શાવવા માટે "so" વપરાય છે.', 'Feb-Mar 2025'],
  [10, 'Go to the Grocery Store. Get me some coffee powder. (but, and, so)', [
    'Go to the Grocery Store but get me some coffee powder.',
    'Go to the Grocery Store and get me some coffee powder.',
    'Go to the Grocery Store so get me some coffee powder.',
  ], 1, 'બે ક્રમિક આજ્ઞાર્થ વાક્યોને જોડવા "and" વપરાય છે.', 'March 2024'],
  [11, 'The boys knew who had done the mischief. They kept mum. (so that, though, or)', [
    'The boys knew who had done the mischief so that they kept mum.',
    'Though the boys knew who had done the mischief, they kept mum.',
    'The boys knew who had done the mischief or they kept mum.',
  ], 1, 'વિરોધાભાસ દર્શાવવા માટે "Though" વપરાય છે.', 'March 2024'],
  [12, 'Simran must work harder. She will not achieve her target. (or else, so, therefore)', [
    'Simran must work harder or else she will not achieve her target.',
    'Simran must work harder so she will not achieve her target.',
    'Simran must work harder therefore she will not achieve her target.',
  ], 0, 'ચેતવણી/નહીં તો અર્થ દર્શાવવા માટે "or else" વપરાય છે.', 'March 2024'],
  [13, 'Sachin played well. India lost the match. (and, but, so)', [
    'Sachin played well and India lost the match.',
    'Sachin played well but India lost the match.',
    'Sachin played well so India lost the match.',
  ], 1, 'વિરોધાભાસ દર્શાવવા માટે "but" વપરાય છે.', 'March 2023'],
  [14, 'Hirva is my friend. Her cousin lives in Indonesia. (who, whom, whose)', [
    'Hirva is my friend who cousin lives in Indonesia.',
    'Hirva is my friend whom cousin lives in Indonesia.',
    'Hirva is my friend whose cousin lives in Indonesia.',
  ], 2, 'સંબંધ/માલિકી (Her → whose) દર્શાવવા માટે "whose" વપરાય છે.', 'March 2023'],
  [15, 'My cousin Nand will eat a sandwich. He will eat a pani puri. (therefore, either....or, neither....nor)', [
    'My cousin Nand will eat a sandwich therefore he will eat a pani puri.',
    'My cousin Nand will eat either a sandwich or a pani puri.',
    'My cousin Nand will eat neither a sandwich nor a pani puri.',
  ], 1, 'બે હકાર વિકલ્પોમાંથી એક પસંદગી માટે "either ... or" વપરાય છે.', 'March 2023'],
  [16, 'Dashrath Manjhi carved a path through the hills. His village could have easier access to medical services. (but, so that, otherwise)', [
    'Dashrath Manjhi carved a path through the hills but his village could have easier access to medical services.',
    'Dashrath Manjhi carved a path through the hills so that his village could have easier access to medical services.',
    'Dashrath Manjhi carved a path through the hills otherwise his village could have easier access to medical services.',
  ], 1, 'હેતુ દર્શાવવા માટે "so that" વપરાય છે.'],
  [17, 'The railway did not have funds. The villagers of Taj Nagar pooled in twenty-one lakh rupees. (so, though, or)', [
    'The railway did not have funds, so the villagers of Taj Nagar pooled in twenty-one lakh rupees.',
    'Though the railway did not have funds, the villagers of Taj Nagar pooled in twenty-one lakh rupees.',
    'The railway did not have funds or the villagers of Taj Nagar pooled in twenty-one lakh rupees.',
  ], 0, 'કારણના પરિણામ (તેથી) માટે "so" વપરાય છે.'],
  [18, 'Villagers had to go to Halimandi to catch a train. They had to go to Patli to catch a train. (neither...nor, either...or, so)', [
    'Villagers had to go neither to Halimandi nor to Patli to catch a train.',
    'Villagers had to go either to Halimandi or to Patli to catch a train.',
    'Villagers had to go to Halimandi so they had to go to Patli to catch a train.',
  ], 1, 'બે વિકલ્પો દર્શાવવા માટે "either ... or" વપરાય છે.'],
  [19, 'Prem Chopra was arrested from his home. None of the stolen articles was recovered from his house. (and, but, therefore)', [
    'Prem Chopra was arrested from his home and none of the stolen articles was recovered from his house.',
    'Prem Chopra was arrested from his home but none of the stolen articles was recovered from his house.',
    'Prem Chopra was arrested from his home therefore none of the stolen articles was recovered from his house.',
  ], 1, 'વિરોધાભાસી હકીકત દર્શાવવા માટે "but" વપરાય છે.'],
  [20, 'Ram Singh chose to break apart. He did not want to tell a lie or harm humans. (because, so, though)', [
    'Ram Singh chose to break apart because he did not want to tell a lie or harm humans.',
    'Ram Singh chose to break apart so he did not want to tell a lie or harm humans.',
    'Though Ram Singh chose to break apart, he did not want to tell a lie or harm humans.',
  ], 0, 'કારણ (reason) દર્શાવવા માટે "because" વપરાય છે.'],
  [21, 'Arun quit his job at Google. He could work full-time for the environment. (though, so that, but)', [
    'Though Arun quit his job at Google, he could work full-time for the environment.',
    'Arun quit his job at Google so that he could work full-time for the environment.',
    'Arun quit his job at Google but he could work full-time for the environment.',
  ], 1, 'હેતુ દર્શાવવા માટે "so that" વપરાય છે.'],
  [22, 'A mother looks very soft. She is very tough inside. (therefore, yet, so)', [
    'A mother looks very soft, therefore she is very tough inside.',
    'A mother looks very soft, yet she is very tough inside.',
    'A mother looks very soft, so she is very tough inside.',
  ], 1, 'વિરોધાભાસ (છતાં પણ) દર્શાવવા માટે "yet" વપરાય છે.'],
  [23, 'Roger Bacon considered black powder dangerous. He wrote of it in a code language. (but, therefore, although)', [
    'Roger Bacon considered black powder dangerous, but he wrote of it in a code language.',
    'Roger Bacon considered black powder dangerous, therefore he wrote of it in a code language.',
    'Although Roger Bacon considered black powder dangerous, he wrote of it in a code language.',
  ], 1, 'પરિણામ (તેથી) દર્શાવવા માટે "therefore" વપરાય છે.'],
  [24, 'Helen Keller was blind and deaf. She earned a Bachelor of Arts degree. (so, because, though)', [
    'Helen Keller was blind and deaf, so she earned a Bachelor of Arts degree.',
    'Because Helen Keller was blind and deaf, she earned a Bachelor of Arts degree.',
    'Though Helen Keller was blind and deaf, she earned a Bachelor of Arts degree.',
  ], 2, 'વિરોધાભાસ (છતાં પણ) દર્શાવવા માટે "Though" વપરાય છે.'],
  [25, 'Shukracharya was a great saint. He knew the mantra for bringing dead people back to life. (whom, who, whose)', [
    'Shukracharya was a great saint whom knew the mantra for bringing dead people back to life.',
    'Shukracharya was a great saint who knew the mantra for bringing dead people back to life.',
    'Shukracharya was a great saint whose knew the mantra for bringing dead people back to life.',
  ], 1, 'વ્યક્તિ કર્તા (He) ને જોડવા Relative Pronoun "who" વપરાય છે.'],
  [26, 'Devayani loved Kach deeply. Kach considered her his sister. (and, but, so)', [
    'Devayani loved Kach deeply and Kach considered her his sister.',
    'Devayani loved Kach deeply but Kach considered her his sister.',
    'Devayani loved Kach deeply so Kach considered her his sister.',
  ], 1, 'વિરોધાભાસી પરિસ્થિતિ માટે "but" વપરાય છે.'],
  [27, 'People use Diclofenac to cure sick cattle. Vultures die after eating such flesh. (and, but, otherwise)', [
    'People use Diclofenac to cure sick cattle and vultures die after eating such flesh.',
    'People use Diclofenac to cure sick cattle but vultures die after eating such flesh.',
    'People use Diclofenac to cure sick cattle otherwise vultures die after eating such flesh.',
  ], 0, 'બંને ઘટનાઓને જોડવા માટે "and" વપરાય છે.'],
  [28, 'Students should eat light food during exams. Heavy food slows down brain activities. (so, because, though)', [
    'Students should eat light food during exams so heavy food slows down brain activities.',
    'Students should eat light food during exams because heavy food slows down brain activities.',
    'Students should eat light food during exams though heavy food slows down brain activities.',
  ], 1, 'કારણ દર્શાવવા માટે "because" વપરાય છે.'],
  [29, 'Blandford went to Grand Central Station. He wanted to meet Hollis Meynell. (and, so that, but)', [
    'Blandford went to Grand Central Station and wanted to meet Hollis Meynell.',
    'Blandford went to Grand Central Station so that he wanted to meet Hollis Meynell.',
    'Blandford went to Grand Central Station but wanted to meet Hollis Meynell.',
  ], 0, 'બંને હકીકતો જોડવા માટે "and" નો ઉપયોગ સાચો છે.'],
  [30, 'Saputara is a famous hill station. It is located in the Dang District. (where, which, who)', [
    'Saputara is a famous hill station where is located in the Dang District.',
    'Saputara is a famous hill station which is located in the Dang District.',
    'Saputara is a famous hill station who is located in the Dang District.',
  ], 1, 'It (નિર્જીવ સ્થળના કર્તા) માટે Relative Pronoun "which" વપરાય છે.'],
  [31, 'Solar power is cheaper than kerosene. It is a smokeless source of light. (and, but, or)', [
    'Solar power is cheaper than kerosene and it is a smokeless source of light.',
    'Solar power is cheaper than kerosene but it is a smokeless source of light.',
    'Solar power is cheaper than kerosene or it is a smokeless source of light.',
  ], 0, 'બે હકારાત્મક ગુણોને જોડવા માટે "and" વપરાય છે.'],
  [32, 'Azaz installs the solar panel in a southerly direction. It can capture as much sunlight as possible. (because, so that, though)', [
    'Azaz installs the solar panel in a southerly direction because it can capture as much sunlight as possible.',
    'Azaz installs the solar panel in a southerly direction so that it can capture as much sunlight as possible.',
    'Azaz installs the solar panel in a southerly direction though it can capture as much sunlight as possible.',
  ], 1, 'હેતુ દર્શાવવા માટે "so that" વપરાય છે.'],
  [33, "Palakkad is the district in Kerala. A women's unit was launched in its public library. (which, where, whose)", [
    "Palakkad is the district in Kerala which a women's unit was launched in its public library.",
    "Palakkad is the district in Kerala where a women's unit was launched in its public library.",
    "Palakkad is the district in Kerala whose a women's unit was launched in its public library.",
  ], 1, 'સ્થળ (જ્યાં) દર્શાવવા માટે "where" વપરાય છે.'],
  [34, 'Reveal the top secret information. I will diffuse your system. (and, otherwise, so)', [
    'Reveal the top secret information and I will diffuse your system.',
    'Do not reveal the top secret information otherwise I will diffuse your system.',
    'Reveal the top secret information so I will diffuse your system.',
  ], 1, 'ચેતવણી (નહીં તો) અર્થ માટે "otherwise" સાથેનું સાચું વાક્ય: Do not reveal the top secret information otherwise I will diffuse your system.'],
  [35, 'Ram Singh-070 was caught stealing gems. Prem Chopra fled from the spot. (and, but, therefore)', [
    'Ram Singh-070 was caught stealing gems and Prem Chopra fled from the spot.',
    'Ram Singh-070 was caught stealing gems but Prem Chopra fled from the spot.',
    'Ram Singh-070 was caught stealing gems therefore Prem Chopra fled from the spot.',
  ], 0, 'સળંગ બે ઘટનાઓને જોડવા "and" વપરાય છે.'],
  [36, "The lake next to Arun's house was heavily polluted. It led to the spread of mosquitoes. (but, so, though)", [
    "The lake next to Arun's house was heavily polluted, but it led to the spread of mosquitoes.",
    "The lake next to Arun's house was heavily polluted, so it led to the spread of mosquitoes.",
    "Though the lake next to Arun's house was heavily polluted, it led to the spread of mosquitoes.",
  ], 1, 'પરિણામ (તેથી) દર્શાવવા માટે "so" વપરાય છે.'],
  [37, 'We should reduce the amount of garbage at home. We should dispose of all garbage safely. (and, but, or)', [
    'We should reduce the amount of garbage at home and dispose of all garbage safely.',
    'We should reduce the amount of garbage at home but dispose of all garbage safely.',
    'We should reduce the amount of garbage at home or dispose of all garbage safely.',
  ], 0, 'બંને સારી ક્રિયાઓ જોડવા "and" વપરાય છે.'],
  [38, 'The angel requested the Lord to go to bed. The Lord refused to take rest. (so, because, but)', [
    'The angel requested the Lord to go to bed so the Lord refused to take rest.',
    'The angel requested the Lord to go to bed because the Lord refused to take rest.',
    'The angel requested the Lord to go to bed but the Lord refused to take rest.',
  ], 2, 'વિરોધાભાસ દર્શાવવા માટે "but" વપરાય છે.'],
  [39, 'A mother has three pairs of eyes. She can see her children through closed doors. (so that, though, or)', [
    'A mother has three pairs of eyes so that she can see her children through closed doors.',
    'A mother has three pairs of eyes though she can see her children through closed doors.',
    'A mother has three pairs of eyes or she can see her children through closed doors.',
  ], 0, 'હેતુ દર્શાવવા માટે "so that" વપરાય છે.'],
  [40, 'The mixture is stable if kept cool and dry. It can catch fire if heat is accidentally applied. (and, but, therefore)', [
    'The mixture is stable if kept cool and dry and it can catch fire if heat is accidentally applied.',
    'The mixture is stable if kept cool and dry but it can catch fire if heat is accidentally applied.',
    'The mixture is stable if kept cool and dry therefore it can catch fire if heat is accidentally applied.',
  ], 1, 'વિરોધાભાસી પરિસ્થિતિ માટે "but" વપરાય છે.'],
  [41, 'You get a burn while lighting crackers. Go to a doctor immediately. (If, Though, Because)', [
    'If you get a burn while lighting crackers, go to a doctor immediately.',
    'Though you get a burn while lighting crackers, go to a doctor immediately.',
    'Because you get a burn while lighting crackers, go to a doctor immediately.',
  ], 0, 'શરત (જો) દર્શાવવા માટે "If" વપરાય છે.'],
  [42, 'Helen Keller lost her father shortly before her examination. She did her best and passed all subjects. (Therefore, Although, Because)', [
    'Helen Keller lost her father shortly before her examination, therefore she did her best and passed all subjects.',
    'Although Helen Keller lost her father shortly before her examination, she did her best and passed all subjects.',
    'Because Helen Keller lost her father shortly before her examination, she did her best and passed all subjects.',
  ], 1, 'વિરોધાભાસ દર્શાવવા માટે "Although" વપરાય છે.'],
  [43, 'Miss Sullivan lost her eyesight completely. She continued to help Helen without heeding her own problem. (because, yet, so)', [
    'Miss Sullivan was losing her eyesight because she continued to help Helen without heeding her own problem.',
    'Miss Sullivan was losing her eyesight, yet she continued to help Helen without heeding her own problem.',
    'Miss Sullivan was losing her eyesight, so she continued to help Helen without heeding her own problem.',
  ], 1, 'વિરોધાભાસ (છતાં પણ) દર્શાવવા માટે "yet" વપરાય છે.'],
  [44, 'Kach revived Shukracharya with his newly learnt mantra. He paid homage to him calling him father. (and, but, or)', [
    'Kach revived Shukracharya with his newly learnt mantra and paid homage to him calling him father.',
    'Kach revived Shukracharya with his newly learnt mantra but paid homage to him calling him father.',
    'Kach revived Shukracharya with his newly learnt mantra or paid homage to him calling him father.',
  ], 0, 'બે ક્રમિક ક્રિયાઓ જોડવા માટે "and" વપરાય છે.'],
  [45, 'The weaver bird builds a nest. Its entrance is at the bottom. (who, whose, whom)', [
    'The weaver bird builds a nest who entrance is at the bottom.',
    'The weaver bird builds a nest whose entrance is at the bottom.',
    'The weaver bird builds a nest whom entrance is at the bottom.',
  ], 1, 'Its (માલિકી/સંબંધ) માટે Relative Pronoun "whose" વપરાય છે.'],
  [46, 'Take short breaks while studying. Your brain will get tired. (and, otherwise, so)', [
    'Take short breaks while studying and your brain will get tired.',
    'Take short breaks while studying otherwise your brain will get tired.',
    'Take short breaks while studying so your brain will get tired.',
  ], 1, 'ચેતવણી (નહીં તો) દર્શાવવા માટે "otherwise" વપરાય છે.'],
  [47, 'Hollis Meynell did not send her photograph to Blandford. She wanted to test his true feelings. (so, because, though)', [
    'Hollis Meynell did not send her photograph to Blandford so she wanted to test his true feelings.',
    'Hollis Meynell did not send her photograph to Blandford because she wanted to test his true feelings.',
    'Hollis Meynell did not send her photograph to Blandford though she wanted to test his true feelings.',
  ], 1, 'કારણ દર્શાવવા માટે "because" વપરાય છે.'],
  [48, 'Blandford saw a young girl in a green suit. He saw a woman past forty wearing a red rose. (neither...nor, not only...but also, or)', [
    'Blandford saw neither a young girl in a green suit nor a woman past forty wearing a red rose.',
    'Blandford saw not only a young girl in a green suit but also a woman past forty wearing a red rose.',
    'Blandford saw a young girl in a green suit or a woman past forty wearing a red rose.',
  ], 1, 'બંને બાબતોનો સમાવેશ દર્શાવવા "not only ... but also" વપરાય છે.'],
];

const conjQuestions: QuizQuestion[] = CONJ_SPECS.map(([num, prompt, options, ansIdx, exp, board]) => ({
  id: `eng_q47_49_${num}`,
  questionMode: 'mcq',
  questionText: `${num}) Join the sentences using the appropriate conjunction:\n${prompt}`,
  options: [...options],
  correctIndex: ansIdx,
  explanation: exp,
  sourceLabel: board ? `Section D • Q. 47 to 49 (${board})` : 'Section D • Q. 47 to 49 (Textbook Practice)',
}));

export const englishConjunctionsChapter: QuizChapter = {
  id: 'eng_q47_49',
  subjectId: 'english',
  chapterNumber: 'Section D • Q. 47 to 49',
  title: 'Join the Sentences (વાક્યો જોડો - Conjunctions)',
  subtitle: 'Join the sentences using the appropriate conjunction from the 3 options (48 Questions)',
  questions: conjQuestions,
  questionTypeLabel: 'Conjunctions (3 વિકલ્પ)',
};

// ============================================================
// SECTION D — Q. 50: Fill in the Blanks — Grammar Paragraph (45 Questions)
// Rule 5: Interactive Tap-to-Fill with 3 per-blank bracketed option buttons
// ============================================================

interface Q50Spec {
  num: number;
  board?: string;
  paragraph: string;
  blanks: Array<[options: [string, string, string], ans: string]>;
  exp: string;
}

const Q50_SPECS: Q50Spec[] = [
  {
    num: 1,
    board: 'Feb-Mar 2026',
    paragraph: 'Sonu advised Monu {{0}} hide {{1}} but Monu {{2}} not do so and was caught.',
    blanks: [
      [['for', 'to', 'from'], 'to'],
      [['their', 'than', 'there'], 'there'],
      [['was', 'may', 'could'], 'could'],
    ],
    exp: 'advised + to + V1, સ્થળ માટે there, અને ભૂતકાળની અસમર્થતા માટે could આવે.',
  },
  {
    num: 2,
    board: 'June 2025',
    paragraph: 'Kokila was preparing Gujarati Kadhee {{0}} her kitchen. The aroma of the dish was so mouthwatering {{1}} her neighbour came to see {{2}} was being cooked.',
    blanks: [
      [['under', 'on', 'in'], 'in'],
      [['there', 'that', 'then'], 'that'],
      [['what', 'who', 'which'], 'what'],
    ],
    exp: 'in her kitchen, so ... that ની જોડી, અને શું બની રહ્યું હતું તે માટે what આવે.',
  },
  {
    num: 3,
    board: 'Feb-Mar 2025',
    paragraph: "Saina Nehwal is {{0}} first Indian {{1}} won a medal in Badminton at the Olympics. She {{2}} states her winning mantra as 'Hard Work'.",
    blanks: [
      [['a', 'an', 'the'], 'the'],
      [['which', 'who', 'whose'], 'who'],
      [['always', 'never', 'rarely'], 'always'],
    ],
    exp: 'Ordinal "first" પહેલા the, વ્યક્તિ માટે who, અને હંમેશા માટે always આવે.',
  },
  {
    num: 4,
    board: 'March 2024',
    paragraph: 'Dhaumya was on a hiking trip. {{0}} walking {{1}} a muddy wetland, he {{2}} off.',
    blanks: [
      [['When', 'While', 'Since when'], 'While'],
      [['through', 'thorough', 'threw'], 'through'],
      [['slept', 'slapped', 'slipped'], 'slipped'],
    ],
    exp: 'V-ing પહેલા While, માંથી પસાર થવા માટે through, અને લપસી જવા માટે slipped આવે.',
  },
  {
    num: 5,
    board: 'March 2023',
    paragraph: 'King Mahabali was a great king {{0}} ruled over Kerala many years ago. He {{1}} his people very much. People loved him as {{2}} as they loved God.',
    blanks: [
      [['whom', 'who', 'whose'], 'who'],
      [['love', 'loved', 'loves'], 'loved'],
      [['many', 'much', 'more'], 'much'],
    ],
    exp: 'વ્યક્તિ કર્તા માટે who, ભૂતકાળમાં loved, અને "as much as" રચના આવે.',
  },
  {
    num: 6,
    paragraph: 'For twenty-five years, the residents {{0}} Taj Nagar village near Gurgaon lobbied {{1}} a railway station {{2}} their village.',
    blanks: [
      [['of', 'off', 'on'], 'of'],
      [['to', 'for', 'from'], 'for'],
      [['in', 'on', 'at'], 'in'],
    ],
    exp: 'residents of, lobbied for, અને in their village સાચા Prepositions છે.',
  },
  {
    num: 7,
    paragraph: 'Sharmin will take a flight to Mumbai {{0}} Heathrow Airport, London. She arrives {{1}} Mumbai {{2}} Friday, 5th November.',
    blanks: [
      [['to', 'from', 'at'], 'from'],
      [['in', 'on', 'at'], 'in'],
      [['in', 'on', 'at'], 'on'],
    ],
    exp: 'from Heathrow Airport, મોટા શહેર માટે arrives in Mumbai, અને દિવસ/તારીખ પહેલા on Friday આવે.',
  },
  {
    num: 8,
    paragraph: 'Saputara is situated {{0}} an altitude of about 900 meters {{1}} the sea level. The Monsoon Festival is organized {{2}} the month of August.',
    blanks: [
      [['in', 'on', 'at'], 'at'],
      [['under', 'above', 'below'], 'above'],
      [['on', 'at', 'in'], 'in'],
    ],
    exp: 'at an altitude, above the sea level, અને મહિના પહેલા in the month of August આવે.',
  },
  {
    num: 9,
    paragraph: 'Prem Chopra stepped {{0}} the threshold of the hall. One of the robots swiftly came forward {{1}} welcomed him {{2}} a metallic voice.',
    blanks: [
      [['in', 'on', 'at'], 'on'],
      [['and', 'but', 'so'], 'and'],
      [['on', 'in', 'with'], 'in'],
    ],
    exp: 'stepped on the threshold, came forward and welcomed, અને in a metallic voice આવે.',
  },
  {
    num: 10,
    paragraph: 'Ram Singh-070 moved {{0}} the shop, close {{1}} the counter, and picked up a necklace {{2}} making any noise.',
    blanks: [
      [['into', 'inside', 'onto'], 'inside'],
      [['with', 'to', 'for'], 'to'],
      [['with', 'without', 'within'], 'without'],
    ],
    exp: 'moved inside the shop, close to the counter, અને without making any noise આવે.',
  },
  {
    num: 11,
    paragraph: 'Arun Krishnamurthy was just 17 years old {{0}} he founded the NGO EFI. He {{1}} cleaned beaches and water bodies {{2}} Chennai and Delhi.',
    blanks: [
      [['where', 'when', 'why'], 'when'],
      [['has', 'have', 'had'], 'has'],
      [['in', 'on', 'at'], 'in'],
    ],
    exp: 'સમય માટે when, He સાથે Present Perfect has, અને શહેરો માટે in Chennai and Delhi આવે.',
  },
  {
    num: 12,
    paragraph: 'Fish {{0}} keep their eyes open. Even when they sleep, they {{1}} shut their eyes. It {{2}} rains in the desert areas of Rajasthan.',
    blanks: [
      [['always', 'never', 'rarely'], 'always'],
      [['always', 'never', 'often'], 'never'],
      [['always', 'seldom', 'usually'], 'seldom'],
    ],
    exp: 'માછલી હંમેશા આંખો ખુલ્લી રાખે છે (always), ક્યારેય બંધ કરતી નથી (never), અને રણમાં ભાગ્યે જ (seldom) વરસાદ પડે છે.',
  },
  {
    num: 13,
    paragraph: 'The good Lord {{0}} extremely busy that day. When he was working {{1}} full concentration, an angel appeared {{2}} commented on his creation.',
    blanks: [
      [['is', 'was', 'were'], 'was'],
      [['by', 'with', 'from'], 'with'],
      [['and', 'but', 'or'], 'and'],
    ],
    exp: 'ભૂતકાળ એકવચન માટે was, with full concentration, અને બે ક્રિયા જોડવા and આવે.',
  },
  {
    num: 14,
    paragraph: 'The National Film Awards {{0}} every year to recognize outstanding work. The awards {{1}} presented in 1954 {{2}} held in high esteem.',
    blanks: [
      [['give', 'are given', 'gave'], 'are given'],
      [['first', 'firstly', 'one'], 'first'],
      [['is', 'are', 'were'], 'are'],
    ],
    exp: 'Passive રચના are given, first presented, અને બહુવચન awards સાથે are held આવે.',
  },
  {
    num: 15,
    paragraph: 'Pyrotechnics includes not only fireworks {{0}} a whole range of devices {{1}} use similar materials and principles, {{2}} safety matches to rocket boosters.',
    blanks: [
      [['and', 'but also', 'or'], 'but also'],
      [['who', 'which', 'where'], 'which'],
      [['from', 'to', 'by'], 'from'],
    ],
    exp: 'not only ... but also, devices માટે which, અને from ... to ની જોડી આવે.',
  },
  {
    num: 16,
    paragraph: 'Fireworks should never be stored {{0}} unpacked near a flame. One should never bend {{1}} a firework when lighting it, and if you get a burn, go {{2}} a doctor immediately.',
    blanks: [
      [['and', 'or', 'but'], 'or'],
      [['under', 'over', 'in'], 'over'],
      [['at', 'for', 'to'], 'to'],
    ],
    exp: 'નકારમાં or, ફટાકડા ઉપર ઝૂકવા માટે bend over, અને go to a doctor આવે.',
  },
  {
    num: 17,
    paragraph: 'Take a large pot and {{0}} three tablespoons of oil in it. {{1}} the oil on a high flame {{2}} it becomes hot.',
    blanks: [
      [['put', 'puts', 'putting'], 'put'],
      [['Heat', 'Heating', 'Heated'], 'Heat'],
      [['until', 'when', 'where'], 'until'],
    ],
    exp: 'આજ્ઞાર્થ ક્રિયાપદના મૂળ રૂપ put અને Heat, તથા જ્યાં સુધી ગરમ ન થાય ત્યાં સુધી માટે until આવે.',
  },
  {
    num: 18,
    paragraph: 'Helen Keller became deaf {{0}} blind when she was very young. Her parents {{1}} extremely worried until they found Miss Sullivan, a teacher {{2}} the deaf and blind.',
    blanks: [
      [['or', 'and', 'but'], 'and'],
      [['was', 'were', 'are'], 'were'],
      [['of', 'for', 'to'], 'for'],
    ],
    exp: 'deaf and blind, parents (બહુવચન) સાથે were, અને a teacher for આવે.',
  },
  {
    num: 19,
    paragraph: 'On 28th June, 1904, Helen graduated {{0}} Radcliffe College. She became {{1}} first deaf-blind person {{2}} a Bachelor of Arts degree.',
    blanks: [
      [['by', 'from', 'to'], 'from'],
      [['a', 'an', 'the'], 'the'],
      [['earn', 'to earn', 'earning'], 'to earn'],
    ],
    exp: 'graduated from, the first person, અને to earn (infinitive) આવે.',
  },
  {
    num: 20,
    paragraph: "Kach went to Shukracharya's hermitage {{0}} learn Sanjivani Vidya. Because {{1}} his keen devotion and good service, he {{2}} the favour of his teacher.",
    blanks: [
      [['so that', 'in order to', 'because'], 'in order to'],
      [['of', 'off', 'for'], 'of'],
      [['win', 'won', 'wins'], 'won'],
    ],
    exp: 'V1 (learn) પહેલા in order to, Because of, અને ભૂતકાળમાં won આવે.',
  },
  {
    num: 21,
    paragraph: "One day when Kach {{0}} his master's cows to the jungle, the Asurs waylaid him and killed him. They cut his body {{1}} pieces and gave them {{2}} wolves and jackals.",
    blanks: [
      [['take', 'was taking', 'took'], 'was taking'],
      [['in', 'into', 'onto'], 'into'],
      [['for', 'to', 'at'], 'to'],
    ],
    exp: 'ચાલુ ભૂતકાળ was taking, cut into pieces, અને gave them to આવે.',
  },
  {
    num: 22,
    paragraph: 'Birds are our feathered friends {{0}} help us in many ways. The weaver bird {{1}} an unusual nest {{2}} long strips of grass.',
    blanks: [
      [['who', 'which', 'whom'], 'which'],
      [['build', 'builds', 'built'], 'builds'],
      [['with', 'by', 'from'], 'with'],
    ],
    exp: 'પક્ષીઓ માટે which, એકવચન વર્તમાનકાળ builds, અને સાધન/સામગ્રી માટે with આવે.',
  },
  {
    num: 23,
    paragraph: 'Many students suffer {{0}} exam fear. If they plan {{1}} studies well in advance, they {{2}} easily overcome stress.',
    blanks: [
      [['by', 'from', 'with'], 'from'],
      [['their', 'there', 'they'], 'their'],
      [['can', 'could', 'would'], 'can'],
    ],
    exp: 'suffer from, their studies, અને વર્તમાનકાળની શરત સાથે can આવે.',
  },
  {
    num: 24,
    paragraph: 'Lieutenant Blandford lifted his face {{0}} noted the time on the clock {{1}} the information desk. His heart {{2}} beating very fast.',
    blanks: [
      [['and', 'but', 'so'], 'and'],
      [['under', 'above', 'in'], 'above'],
      [['is', 'was', 'were'], 'was'],
    ],
    exp: 'lifted ... and noted, clock above the information desk, અને ભૂતકાળ એકવચન was beating આવે.',
  },
  {
    num: 25,
    paragraph: 'After efforts of a year, I {{0}} to visit Sabarmati Central Jail. It was an opportunity of a lifetime to visit the cell {{1}} Mahatma Gandhi was kept {{2}} 1922.',
    blanks: [
      [['allowed', 'was allowed', 'am allowed'], 'was allowed'],
      [['which', 'where', 'when'], 'where'],
      [['on', 'at', 'in'], 'in'],
    ],
    exp: 'ભૂતકાળ Passive was allowed, સ્થળ માટે where, અને વર્ષ પહેલા in 1922 આવે.',
  },
  {
    num: 26,
    paragraph: 'On 7 January 2010, {{0}} first railway station in the country, {{1}} which the railway did not have to spend {{2}} single rupee, started operations.',
    blanks: [
      [['a', 'an', 'the'], 'the'],
      [['in', 'on', 'at'], 'on'],
      [['a', 'an', 'the'], 'a'],
    ],
    exp: 'the first railway station, spend on which, અને a single rupee આવે.',
  },
  {
    num: 27,
    paragraph: 'The Palakkad District Public Library has been up {{0}} running {{1}} September 2013. A third {{2}} its thousand members are women.',
    blanks: [
      [['and', 'but', 'or'], 'and'],
      [['for', 'since', 'from'], 'since'],
      [['of', 'off', 'in'], 'of'],
    ],
    exp: 'up and running, ચોક્કસ સમયથી માટે since September 2013, અને A third of આવે.',
  },
  {
    num: 28,
    paragraph: 'The salesman led Prem Chopra {{0}} a brightly-lit gallery {{1}} a huge dome-shaped hall glowing {{2}} fluorescent light.',
    blanks: [
      [['through', 'thorough', 'threw'], 'through'],
      [['in', 'into', 'onto'], 'into'],
      [['by', 'with', 'from'], 'with'],
    ],
    exp: 'through a gallery, અંદર પ્રવેશવાની ગતિ માટે into a hall, અને glowing with light આવે.',
  },
  {
    num: 29,
    paragraph: 'Ram Singh-070 has an inbuilt system {{0}} three principles: the robot will obey {{1}} master, will not harm humans, and will not take harm {{2}} self.',
    blanks: [
      [['of', 'for', 'with'], 'of'],
      [['her', 'his', 'their'], 'his'],
      [['for', 'to', 'at'], 'to'],
    ],
    exp: 'system of three principles, his master, અને harm to self આવે.',
  },
  {
    num: 30,
    paragraph: "Both Arun's school and college had plenty {{0}} green cover and both {{1}} home to several other life forms. This made him {{2}} their importance.",
    blanks: [
      [['of', 'off', 'for'], 'of'],
      [['was', 'were', 'are'], 'were'],
      [['understand', 'understood', 'understanding'], 'understand'],
    ],
    exp: 'plenty of, બહુવચન both સાથે were, અને made + object + V1 (understand) આવે.',
  },
  {
    num: 31,
    paragraph: 'We wear nose masks and sanitary gloves {{0}} which we collect the garbage and dump it into collection buckets {{1}} are taken {{2}} the garbage truck.',
    blanks: [
      [['with', 'by', 'for'], 'with'],
      [['who', 'which', 'where'], 'which'],
      [['at', 'to', 'for'], 'to'],
    ],
    exp: 'with which, buckets (વસ્તુ) માટે which, અને taken to the truck આવે.',
  },
  {
    num: 32,
    paragraph: 'The angel went round {{0}} model of the mother very slowly. He touched it {{1}} said that it {{2}} too soft.',
    blanks: [
      [['a', 'an', 'the'], 'the'],
      [['and', 'but', 'so'], 'and'],
      [['is', 'was', 'were'], 'was'],
    ],
    exp: 'ચોક્કસ મોડેલ માટે the, બે ક્રિયા જોડવા and, અને ભૂતકાળમાં was આવે.',
  },
  {
    num: 33,
    paragraph: 'National Film Awards {{0}} in a formal ceremony in Delhi. The President {{1}} India hands over the awards, and millions of people {{2}} the ceremony.',
    blanks: [
      [['present', 'are presented', 'presented'], 'are presented'],
      [['of', 'for', 'in'], 'of'],
      [['watch', 'watches', 'watched'], 'watch'],
    ],
    exp: 'Passive રચના are presented, President of India, અને બહુવચન people સાથે watch આવે.',
  },
  {
    num: 34,
    paragraph: 'The basic formula {{0}} black powder has remained unchanged {{1}} centuries. It is a blend of potassium nitrate, charcoal, and sulphur {{2}} the ratio of 75:15:10 by weight.',
    blanks: [
      [['of', 'for', 'in'], 'of'],
      [['since', 'for', 'from'], 'for'],
      [['on', 'in', 'at'], 'in'],
    ],
    exp: 'formula of, સમયગાળા માટે for centuries, અને in the ratio of આવે.',
  },
  {
    num: 35,
    paragraph: 'In Sivakasi, fireworks {{0}} in a number of small units. Three months {{1}} the festival is the {{2}} time for these units.',
    blanks: [
      [['manufacture', 'are manufactured', 'manufactured'], 'are manufactured'],
      [['after', 'before', 'during'], 'before'],
      [['busy', 'busier', 'busiest'], 'busiest'],
    ],
    exp: 'Passive are manufactured, તહેવાર પહેલા before, અને the સાથે Superlative busiest આવે.',
  },
  {
    num: 36,
    paragraph: "Miss Sullivan used {{0}} Helen to long walks every morning. Helen would write something {{1}} her palm and in turn she {{2}} talk into Helen's palm.",
    blanks: [
      [['take', 'to take', 'taking'], 'to take'],
      [['in', 'on', 'at'], 'on'],
      [['will', 'would', 'can'], 'would'],
    ],
    exp: 'used to take, હથેળી પર લખવા on her palm, અને ભૂતકાળની ટેવ માટે would આવે.',
  },
  {
    num: 37,
    paragraph: 'In 1890, {{0}} the age of about ten, Helen moved {{1}} the Perkins Institution, {{2}} Anne Sullivan continued to teach her.',
    blanks: [
      [['in', 'on', 'at'], 'at'],
      [['at', 'to', 'for'], 'to'],
      [['which', 'where', 'when'], 'where'],
    ],
    exp: 'at the age of, moved to, અને સ્થળ માટે where આવે.',
  },
  {
    num: 38,
    paragraph: 'The Devs and Asurs {{0}} always fighting each other. The Asurs had on {{1}} side a great saint, Shukracharya, {{2}} knew the Sanjivani Vidya.',
    blanks: [
      [['was', 'were', 'are'], 'were'],
      [['there', 'their', 'they'], 'their'],
      [['whom', 'who', 'whose'], 'who'],
    ],
    exp: 'બહુવચન ભૂતકાળ were, their side, અને વ્યક્તિ માટે who આવે.',
  },
  {
    num: 39,
    paragraph: 'Shukracharya taught Kach the secret mantra {{0}} asked him to come out {{1}} his stomach. Kach appeared in all {{2}} brilliance and revived his teacher.',
    blanks: [
      [['and', 'but', 'or'], 'and'],
      [['of', 'off', 'from'], 'of'],
      [['her', 'his', 'their'], 'his'],
    ],
    exp: 'taught ... and asked, come out of, અને Kach માટે his brilliance આવે.',
  },
  {
    num: 40,
    paragraph: 'The tailor bird stitches two large leaves together {{0}} fibres of plants. The female lays eggs {{1}} the cosy nest, and {{2}} parents feed the young ones.',
    blanks: [
      [['with', 'by', 'from'], 'with'],
      [['on', 'in', 'at'], 'in'],
      [['both', 'all', 'either'], 'both'],
    ],
    exp: 'with fibres, in the cosy nest, અને માતા-પિતા બંને માટે both parents આવે.',
  },
  {
    num: 41,
    paragraph: 'Vultures are called scavengers {{0}} they clean our surroundings {{1}} eating dead animals. Their strong beaks are designed {{2}} flesh easily.',
    blanks: [
      [['so', 'because', 'though'], 'because'],
      [['with', 'by', 'for'], 'by'],
      [['tear', 'to tear', 'tearing'], 'to tear'],
    ],
    exp: 'કારણ માટે because, દ્વારા માટે by eating, અને designed to tear આવે.',
  },
  {
    num: 42,
    paragraph: 'A seminar {{0}} at Sardar Patel Vidyalaya to advise students {{1}} their parents on how {{2}} exam stress.',
    blanks: [
      [['organized', 'was organized', 'is organizing'], 'was organized'],
      [['and', 'or', 'but'], 'and'],
      [['overcome', 'to overcome', 'overcoming'], 'to overcome'],
    ],
    exp: 'Passive was organized, students and their parents, અને how to overcome આવે.',
  },
  {
    num: 43,
    paragraph: 'Students should eat light {{0}} nutritious food during exams. Heavy food {{1}} down brain activities, {{2}} affects concentration.',
    blanks: [
      [['and', 'but', 'or'], 'and'],
      [['slow', 'slows', 'slowed'], 'slows'],
      [['which', 'who', 'where'], 'which'],
    ],
    exp: 'light and nutritious, એકવચન Heavy food સાથે slows, અને આગળની વાતના સંદર્ભમાં which આવે.',
  },
  {
    num: 44,
    paragraph: "Blandford found Hollis Meynell's name {{0}} the cover of a book. He wrote her a letter {{1}} she answered, so they continued writing {{2}} each other.",
    blanks: [
      [['outside', 'inside', 'on'], 'inside'],
      [['and', 'but', 'so'], 'and'],
      [['to', 'for', 'with'], 'to'],
    ],
    exp: 'inside the cover, wrote ... and she answered, અને writing to each other આવે.',
  },
  {
    num: 45,
    paragraph: 'A young girl in a green suit walked {{0}} Blandford. She was very pretty {{1}} had a warm smile, {{2}} she was not wearing a red rose.',
    blanks: [
      [['towards', 'against', 'under'], 'towards'],
      [['and', 'but', 'so'], 'and'],
      [['and', 'but', 'therefore'], 'but'],
    ],
    exp: 'walked towards, pretty and had a warm smile, અને વિરોધાભાસ માટે but આવે.',
  },
];

const q50Questions: QuizQuestion[] = Q50_SPECS.map((item) => {
  const blanks: TapFillBlankSpec[] = item.blanks.map(([options, correctAnswer]) => ({
    options: [...options],
    correctAnswer,
  }));
  return {
    id: `eng_q50_${item.num}`,
    questionMode: 'tap_fill_per_blank',
    questionText: `${item.num}) ${item.paragraph}`,
    options: [],
    correctIndex: 0,
    blanks,
    explanation: `${item.exp}\nસાચા જવાબો: ${blanks.map((b, i) => `(${i + 1}) ${b.correctAnswer}`).join(', ')}`,
    sourceLabel: item.board
      ? `Section D • Q. 50 (${item.board})`
      : 'Section D • Q. 50 (Textbook Practice)',
  };
});

export const englishGrammarBlanksChapter: QuizChapter = {
  id: 'eng_q50',
  subjectId: 'english',
  chapterNumber: 'Section D • Q. 50',
  title: 'Fill in the Blanks (વ્યાકરણ ખાલી જગ્યા)',
  subtitle: 'Tap the appropriate option from the 3 bracketed words for each blank (45 Questions)',
  questions: q50Questions,
  questionTypeLabel: 'Tap-to-Fill (3 વિકલ્પ/ખાલી જગ્યા)',
};
