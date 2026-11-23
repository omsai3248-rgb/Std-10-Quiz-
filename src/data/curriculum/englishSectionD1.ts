import type { QuizChapter, QuizQuestion, TapFillBlankSpec } from '../../types/models';

// ============================================================
// SECTION D — Q. 46: Indirect Narration (45 Questions)
// Rule 5: Tap-to-Fill with styled Dialogue + 3 per-blank option buttons
// ============================================================

interface Q46Spec {
  num: number;
  board?: string;
  dialogue: Array<{ speaker: string; text: string }>;
  paragraph: string;
  blanks: Array<[options: [string, string, string], ans: string]>;
  exp: string;
}

const Q46_SPECS: Q46Spec[] = [
  {
    num: 1,
    board: 'Feb-Mar 2026',
    dialogue: [
      { speaker: 'Warrior', text: '"Now, I am ready to die. Split my head in two."' },
      { speaker: 'Youth', text: '"You\'re a murderer. But I\'ve learnt much from you in these last few years. How can I kill my teacher?"' },
    ],
    paragraph:
      'The warrior told that he was ready to die {{0}} and requested to split his head in two. The youth told that he {{1}} a murderer but {{2}} had learnt from him in those last few years. He further {{3}} how he could kill his teacher.',
    blanks: [
      [['than', 'then', 'that day'], 'then'],
      [['were', 'had been', 'was'], 'was'],
      [['I', 'you', 'he'], 'he'],
      [['told', 'exclaimed with anger', 'asked'], 'asked'],
    ],
    exp: 'Indirect Speech નિયમ: Now → then, are → was (he સાથે), I → he, અને પ્રશ્નાર્થ વાક્ય હોવાથી asked આવે.',
  },
  {
    num: 2,
    board: 'June 2025',
    dialogue: [
      { speaker: 'Yash', text: 'When are you going to the Prerana programme, Vadnagar?' },
      { speaker: 'Shreya', text: 'Around June, 2025.' },
      { speaker: 'Yash', text: 'How lucky you are! Only one boy and one girl from the entire district get this opportunity.' },
      { speaker: 'Shreya', text: 'Yes, I am so happy.' },
    ],
    paragraph:
      'Yash {{0}} Shreya {{1}} she was going to the Prerana Programme, Vadnagar. Shreya replied that she would go around in June, 2025. Yash {{2}} with praise that she {{3}} very lucky because only one boy and one girl from the entire district got that opportunity. Shreya agreed and added that she was very happy.',
    blanks: [
      [['said', 'asked', 'told'], 'asked'],
      [['when', 'why', 'where'], 'when'],
      [['asked', 'proposed', 'exclaimed'], 'exclaimed'],
      [['is', 'was', 'were'], 'was'],
    ],
    exp: 'પ્રશ્નાર્થ માટે asked + when, ઉદ્ગાર વાક્ય "How lucky you are!" માટે exclaimed with praise + was આવે.',
  },
  {
    num: 3,
    board: 'Feb-Mar 2025',
    dialogue: [
      { speaker: 'Yagnesh', text: 'Have you watched the movie, Kantara?' },
      { speaker: 'Trupati', text: "No, I haven't." },
      { speaker: 'Yagnesh', text: 'I am sending you on Telegram.' },
      { speaker: 'Trupati', text: 'Thank you.' },
    ],
    paragraph:
      'Yagnesh asked Trupati {{0}} she had watched the movie Kantara. Trupati replied in negative. Yagnesh told {{1}} that he {{2}} her on Telegram. Trupati {{3}} Yagnesh.',
    blanks: [
      [['that', 'if', 'what'], 'if'],
      [['she', 'him', 'her'], 'her'],
      [['sent', 'was sending', 'had sent'], 'was sending'],
      [['thanks', 'thanking', 'thanked'], 'thanked'],
    ],
    exp: 'Yes/No પ્રશ્ન માટે if, સ્ત્રીલિંગ કર્મ માટે her, "am sending" → was sending, અને "Thank you" → thanked.',
  },
  {
    num: 4,
    board: 'March 2024',
    dialogue: [
      { speaker: 'Adi', text: 'How do you create new games on your computer?' },
      { speaker: 'Abhi', text: "It's easy. You can also create games." },
      { speaker: 'Adi', text: 'Please teach me.' },
    ],
    paragraph:
      'Adi {{0}} Abhi how {{1}} created new games on his computer. Abhi replied {{2}} it was easy and added that he {{3}} also create games. Adi requested Abhi to teach him.',
    blanks: [
      [['requested', 'told', 'asked'], 'asked'],
      [['I', 'he', 'you'], 'he'],
      [['that', 'if', 'whether'], 'that'],
      [['can', 'could', 'would'], 'could'],
    ],
    exp: 'પ્રશ્ન માટે asked, you → he, વિધાન માટે that, અને can → could થાય.',
  },
  {
    num: 5,
    board: 'March 2023',
    dialogue: [
      { speaker: 'Prathvi', text: 'What do you say about my project?' },
      { speaker: 'Heer', text: 'I can say nothing but excellent.' },
      { speaker: 'Prathvi', text: 'Thank you, dear.' },
    ],
    paragraph:
      'Prathvi {{0}} Heer what {{1}} said about his project. Heer replied that she {{2}} say nothing but excellent. Prathvi {{3}} her lovingly.',
    blanks: [
      [['told', 'asked', 'ordered'], 'asked'],
      [['she', 'he', 'I'], 'she'],
      [['can', 'could', 'would'], 'could'],
      [['thank', 'thanking', 'thanked'], 'thanked'],
    ],
    exp: 'પ્રશ્ન માટે asked, Heer માટે she, can → could, અને Thank you → thanked આવે.',
  },
  {
    num: 6,
    dialogue: [
      { speaker: 'Coastguard', text: '"Come out of the water. Swimming is not allowed here."' },
      { speaker: 'Boy', text: '"I am not swimming. I am drowning."' },
    ],
    paragraph:
      'The coastguard {{0}} the boy {{1}} out of the water and added that swimming {{2}} not allowed {{3}}. The boy replied that he was not swimming but drowning.',
    blanks: [
      [['asked', 'told', 'inquired'], 'asked'],
      [['come', 'to come', 'coming'], 'to come'],
      [['is', 'was', 'were'], 'was'],
      [['here', 'there', 'then'], 'there'],
    ],
    exp: 'આજ્ઞાર્થ માટે asked ... to come, is → was, અને here → there થાય.',
  },
  {
    num: 7,
    dialogue: [
      { speaker: 'Patient', text: '"Doctor, lots of my hair fell out while I was brushing it this morning. Have you got anything for it?"' },
      { speaker: 'Doctor', text: '"Yes, I have got a box."' },
    ],
    paragraph:
      'The patient told the doctor that lots of his hair {{0}} out while he had been brushing it {{1}} morning. He further asked {{2}} he had anything for it. The doctor replied {{3}} that he had got a box.',
    blanks: [
      [['fell', 'had fallen', 'has fallen'], 'had fallen'],
      [['this', 'that', 'the'], 'that'],
      [['that', 'if', 'what'], 'if'],
      [['negatively', 'affirmatively', 'angrily'], 'affirmatively'],
    ],
    exp: 'Simple Past (fell) → Past Perfect (had fallen), this → that, Yes/No પ્રશ્ન → if, Yes → affirmatively.',
  },
  {
    num: 8,
    dialogue: [
      { speaker: 'Wife', text: '"I want to see the world!"' },
      { speaker: 'Husband', text: '"I will give you an atlas for your next birthday gift."' },
    ],
    paragraph:
      'The wife {{0}} her husband {{1}} she {{2}} to see the world. The husband replied that he {{3}} give her an atlas for her next birthday as a gift.',
    blanks: [
      [['asked', 'told', 'ordered'], 'told'],
      [['if', 'that', 'what'], 'that'],
      [['want', 'wants', 'wanted'], 'wanted'],
      [['will', 'would', 'can'], 'would'],
    ],
    exp: 'વિધાન વાક્યમાં told + that, want → wanted, અને will → would થાય.',
  },
  {
    num: 9,
    dialogue: [
      { speaker: 'Gajendrabhai', text: '"Did you participate as a teacher in the Teacher\'s Day Celebration?"' },
      { speaker: 'Sherly', text: '"Yes, Sir. I taught English."' },
    ],
    paragraph:
      "Gajendrabhai {{0}} Sherly {{1}} she {{2}} as a teacher in the Teacher's Day Celebration. Sherly replied respectfully in affirmative and added that she {{3}} English.",
    blanks: [
      [['told', 'asked', 'exclaimed'], 'asked'],
      [['that', 'if', 'when'], 'if'],
      [['participated', 'had participated', 'has participated'], 'had participated'],
      [['taught', 'had taught', 'teaches'], 'had taught'],
    ],
    exp: 'Did + V1 → had + V3 (had participated), અને Simple Past "taught" → Past Perfect "had taught".',
  },
  {
    num: 10,
    dialogue: [
      { speaker: 'Secretary', text: '"Good morning, Sir! Could you please sign this paper?"' },
      { speaker: 'Boss', text: '"Yes, sure. Did you get a call from SetMas company today?"' },
    ],
    paragraph:
      'The secretary greeted her boss and {{0}} him {{1}} {{2}} paper. The boss agreed and inquired if she had got a call from SetMas company {{3}}.',
    blanks: [
      [['ordered', 'requested', 'advised'], 'requested'],
      [['sign', 'to sign', 'signing'], 'to sign'],
      [['this', 'that', 'those'], 'that'],
      [['today', 'that day', 'the previous day'], 'that day'],
    ],
    exp: '"Could you please" → requested + to sign, this → that, today → that day.',
  },
  {
    num: 11,
    dialogue: [
      { speaker: 'Rohan', text: '"Can I speak to Twisha, please?"' },
      { speaker: 'Smritiben', text: '"I\'m sorry, she isn\'t in. Who\'s speaking?"' },
    ],
    paragraph:
      'Rohan asked {{0}} he {{1}} speak to Twisha. Smritiben apologized and said that she {{2}} in, and asked {{3}} was speaking.',
    blanks: [
      [['that', 'if', 'why'], 'if'],
      [['can', 'could', 'would'], 'could'],
      [["isn't", "wasn't", "weren't"], "wasn't"],
      [['whom', 'who', 'whose'], 'who'],
    ],
    exp: 'Yes/No પ્રશ્ન માટે if, can → could, isn\'t → wasn\'t, અને "Who\'s speaking?" માટે who આવે.',
  },
  {
    num: 12,
    dialogue: [
      { speaker: 'Amrapali', text: '"How much do you charge for a driving course?"' },
      { speaker: 'Instructor', text: '"Rs. 2000/- for a hatchback. You can come in the morning batch."' },
    ],
    paragraph:
      'Amrapali {{0}} the instructor how much {{1}} {{2}} for a driving course. The instructor replied that it was Rs. 2000/- for a hatchback and added that she {{3}} come in the morning batch.',
    blanks: [
      [['told', 'asked', 'suggested'], 'asked'],
      [['he', 'she', 'you'], 'he'],
      [['charge', 'charged', 'had charged'], 'charged'],
      [['can', 'could', 'will'], 'could'],
    ],
    exp: 'પ્રશ્ન માટે asked, instructor માટે he, Simple Present charge → charged, can → could.',
  },
  {
    num: 13,
    dialogue: [
      { speaker: 'Salesman', text: '"May I help you, sir?"' },
      { speaker: 'Prem Chopra', text: '"I wish to purchase a robot for my home."' },
    ],
    paragraph:
      'The salesman respectfully {{0}} Prem Chopra {{1}} he {{2}} help him. Prem Chopra replied that he {{3}} to purchase a robot for his home.',
    blanks: [
      [['told', 'asked', 'ordered'], 'asked'],
      [['that', 'if', 'what'], 'if'],
      [['may', 'might', 'can'], 'might'],
      [['wish', 'wished', 'had wished'], 'wished'],
    ],
    exp: 'પ્રશ્ન માટે asked + if, may → might, અને wish → wished.',
  },
  {
    num: 14,
    dialogue: [
      { speaker: 'Counsel Goel', text: '"Who is your master?"' },
      { speaker: 'Ram Singh-070', text: '"Mr. Prem Chopra is my master."' },
    ],
    paragraph:
      'Counsel Goel {{0}} Ram Singh-070 {{1}} {{2}} master was. Ram Singh-070 replied in a metallic tone that Mr. Prem Chopra {{3}} his master.',
    blanks: [
      [['asked', 'told', 'requested'], 'asked'],
      [['whom', 'who', 'whose'], 'who'],
      [['his', 'her', 'my'], 'his'],
      [['is', 'was', 'were'], 'was'],
    ],
    exp: 'પ્રશ્ન માટે asked + who, your → his, અને is → was.',
  },
  {
    num: 15,
    dialogue: [
      { speaker: 'Angel', text: '"Lord! Please go to bed, do not take so much trouble."' },
      { speaker: 'Lord', text: '"I cannot go now. I have almost completed the work."' },
    ],
    paragraph:
      'The angel {{0}} the Lord {{1}} to bed and not to take so much trouble. The Lord refused and said that he {{2}} go {{3}} as he had almost completed the work.',
    blanks: [
      [['ordered', 'requested', 'inquired'], 'requested'],
      [['go', 'to go', 'going'], 'to go'],
      [['cannot', 'could not', 'would not'], 'could not'],
      [['now', 'then', 'there'], 'then'],
    ],
    exp: '"Please go" → requested + to go, cannot → could not, now → then.',
  },
  {
    num: 16,
    dialogue: [
      { speaker: 'Kach', text: '"O great teacher, I want to be your student."' },
      { speaker: 'Shukracharya', text: '"I shall be happy to help you in whatever way I can."' },
    ],
    paragraph:
      'Kach respectfully told his great teacher {{0}} he {{1}} to be his student. Shukracharya replied that he {{2}} be happy to help him in whatever way he {{3}}.',
    blanks: [
      [['if', 'that', 'what'], 'that'],
      [['want', 'wanted', 'had wanted'], 'wanted'],
      [['shall', 'would', 'will'], 'would'],
      [['can', 'could', 'may'], 'could'],
    ],
    exp: 'વિધાનમાં that, want → wanted, he સાથે shall → would, અને can → could.',
  },
  {
    num: 17,
    dialogue: [
      { speaker: 'Devayani', text: '"Don\'t go away. Accept me as your wife."' },
      { speaker: 'Kach', text: '"It is a sin if I agree to do what you say."' },
    ],
    paragraph:
      'Devayani {{0}} Kach {{1}} go away and to accept her as his wife. Kach replied that it {{2}} a sin if he {{3}} to do what she said.',
    blanks: [
      [['asked', 'ordered', 'inquired'], 'asked'],
      [['to not', 'not to', "don't"], 'not to'],
      [['is', 'was', 'were'], 'was'],
      [['agree', 'agreed', 'had agreed'], 'agreed'],
    ],
    exp: '"Don\'t go" → asked ... not to go, is → was, agree → agreed.',
  },
  {
    num: 18,
    dialogue: [
      { speaker: 'Shubhangi', text: '"Didi, why do birds migrate in winter?"' },
      { speaker: 'Devangi', text: '"They travel to warmer places in search of food."' },
    ],
    paragraph:
      'Shubhangi {{0}} Devangi {{1}} birds {{2}} in winter. Devangi replied that {{3}} travelled to warmer places in search of food.',
    blanks: [
      [['asked', 'told', 'exclaimed'], 'asked'],
      [['that', 'why', 'when'], 'why'],
      [['migrate', 'migrated', 'had migrated'], 'migrated'],
      [['we', 'they', 'you'], 'they'],
    ],
    exp: 'પ્રશ્ન માટે asked + why, migrate → migrated, અને They → they.',
  },
  {
    num: 19,
    dialogue: [
      { speaker: 'Bharat', text: '"Sir, I forget everything that I read."' },
      { speaker: 'Dr. Mansuri', text: '"Make a proper timetable and revise your lessons regularly."' },
    ],
    paragraph:
      'Bharat told Dr. Mansuri {{0}} he {{1}} everything that he read. Dr. Mansuri {{2}} him {{3}} a proper timetable and revise his lessons regularly.',
    blanks: [
      [['if', 'that', 'what'], 'that'],
      [['forget', 'forgot', 'had forgotten'], 'forgot'],
      [['ordered', 'advised', 'inquired'], 'advised'],
      [['make', 'to make', 'making'], 'to make'],
    ],
    exp: 'વિધાનમાં that, forget → forgot, સલાહ હોવાથી advised + to make.',
  },
  {
    num: 20,
    dialogue: [
      { speaker: 'Blandford', text: '"Are you Hollis Meynell?"' },
      { speaker: 'Woman', text: '"Yes, I am. Will you take me to dinner?"' },
    ],
    paragraph:
      'Blandford {{0}} the woman {{1}} she {{2}} Hollis Meynell. The woman replied affirmatively and asked if he {{3}} take her to dinner.',
    blanks: [
      [['told', 'asked', 'requested'], 'asked'],
      [['that', 'if', 'who'], 'if'],
      [['is', 'was', 'were'], 'was'],
      [['will', 'would', 'can'], 'would'],
    ],
    exp: 'Yes/No પ્રશ્નમાં asked + if, are → was (she સાથે), will → would.',
  },
  {
    num: 21,
    dialogue: [
      { speaker: 'Kandarp', text: '"I will not be able to come to school tomorrow."' },
      { speaker: 'Shyam', text: '"Why are you taking leave?"' },
    ],
    paragraph:
      'Kandarp {{0}} Shyam that he {{1}} not be able to come to school {{2}}. Shyam asked why he {{3}} taking leave.',
    blanks: [
      [['asked', 'told', 'ordered'], 'told'],
      [['will', 'would', 'should'], 'would'],
      [['tomorrow', 'the next day', 'that day'], 'the next day'],
      [['is', 'was', 'were'], 'was'],
    ],
    exp: 'વિધાનમાં told, will → would, tomorrow → the next day, are → was.',
  },
  {
    num: 22,
    dialogue: [
      { speaker: 'Teacher', text: '"I have never been to Shillong."' },
      { speaker: 'Children', text: '"We visited Shillong last year."' },
    ],
    paragraph:
      'The teacher told the children {{0}} she {{1}} never been to Shillong. The children replied that {{2}} {{3}} Shillong the previous year.',
    blanks: [
      [['if', 'that', 'where'], 'that'],
      [['have', 'has', 'had'], 'had'],
      [['we', 'they', 'you'], 'they'],
      [['visited', 'had visited', 'visit'], 'had visited'],
    ],
    exp: 'વિધાનમાં that, have → had, We → they, Simple Past visited → had visited.',
  },
  {
    num: 23,
    dialogue: [
      { speaker: 'Student', text: '"Was it safe to go out in the city streets where you lived?"' },
      { speaker: 'Visitor', text: '"Yes, it was quite safe during the day."' },
    ],
    paragraph:
      'The student inquired {{0}} it {{1}} safe to go out in the city streets where they {{2}}. The visitor replied {{3}} that it had been quite safe during the day.',
    blanks: [
      [['that', 'if', 'when'], 'if'],
      [['was', 'had been', 'is'], 'had been'],
      [['lived', 'had lived', 'live'], 'had lived'],
      [['negatively', 'affirmatively', 'sadly'], 'affirmatively'],
    ],
    exp: 'Yes/No પ્રશ્ન માટે if, was → had been, lived → had lived, Yes → affirmatively.',
  },
  {
    num: 24,
    dialogue: [
      { speaker: 'Friends', text: '"You must see this exhibition."' },
      { speaker: 'Meera', text: '"Let\'s go together in the evening."' },
    ],
    paragraph:
      'All her friends strongly {{0}} Meera {{1}} {{2}} exhibition. Meera {{3}} going together in the evening.',
    blanks: [
      [['ordered', 'advised', 'asked'], 'advised'],
      [['see', 'to see', 'seeing'], 'to see'],
      [['this', 'that', 'those'], 'that'],
      [['suggested', 'warned', 'inquired'], 'suggested'],
    ],
    exp: '"You must see" → advised + to see, this → that, "Let\'s go" → suggested.',
  },
  {
    num: 25,
    dialogue: [
      { speaker: 'Manager', text: '"Sit down. What is your name?"' },
      { speaker: 'Bhuvan', text: '"My name is Bhuvan. When shall I start work?"' },
    ],
    paragraph:
      'The manager told Bhuvan {{0}} down and asked what {{1}} name {{2}}. Bhuvan replied that his name was Bhuvan and asked when he {{3}} start work.',
    blanks: [
      [['sit', 'to sit', 'sitting'], 'to sit'],
      [['your', 'my', 'his'], 'his'],
      [['is', 'was', 'were'], 'was'],
      [['shall', 'should', 'will'], 'should'],
    ],
    exp: 'આજ્ઞાર્થમાં to sit, your → his, is → was, અને "When shall I...?" માટે should આવે.',
  },
  {
    num: 26,
    dialogue: [
      { speaker: 'Ranjit Singh', text: '"They donated money for the station and we started the construction in January 2008."' },
      { speaker: 'Reporter', text: '"How much money did the villagers collect?"' },
    ],
    paragraph:
      'Ranjit Singh said that they {{0}} money for the station and added that they had started the construction in January 2008. The reporter {{1}} how much money the villagers {{2}}.',
    blanks: [
      [['donated', 'had donated', 'have donated'], 'had donated'],
      [['told', 'asked', 'ordered'], 'asked'],
      [['collected', 'had collected', 'collect'], 'had collected'],
    ],
    exp: 'Simple Past donated → had donated, પ્રશ્ન માટે asked, did ... collect → had collected.',
  },
  {
    num: 27,
    dialogue: [
      { speaker: 'Farmer', text: '"We are saving our environment with these solar lights."' },
      { speaker: 'Lady', text: '"Our children are also studying more now."' },
    ],
    paragraph:
      'A farmer from the village said {{0}} they {{1}} saving their environment with {{2}} solar lights. A lady added that their children were also studying more {{3}}.',
    blanks: [
      [['if', 'that', 'what'], 'that'],
      [['are', 'was', 'were'], 'were'],
      [['these', 'those', 'that'], 'those'],
      [['now', 'then', 'there'], 'then'],
    ],
    exp: 'વિધાનમાં that, are → were, these → those, now → then.',
  },
  {
    num: 28,
    dialogue: [
      { speaker: 'Prem Chopra', text: '"Pick up a necklace and hide. Do not make any noise."' },
      { speaker: 'Ram Singh-070', text: '"I will obey your command, master."' },
    ],
    paragraph:
      'Prem Chopra ordered Ram Singh-070 {{0}} up a necklace and hide, and warned him {{1}} make any noise. Ram Singh-070 replied that he {{2}} obey his command.',
    blanks: [
      [['pick', 'to pick', 'picking'], 'to pick'],
      [['to not', 'not to', "don't"], 'not to'],
      [['will', 'would', 'can'], 'would'],
    ],
    exp: 'આજ્ઞાર્થમાં to pick, "Do not" → not to, will → would.',
  },
  {
    num: 29,
    dialogue: [
      { speaker: 'Judge', text: '"The case started a fortnight after the incident."' },
      { speaker: 'Counsel Goel', text: '"Sir, the robot has been switched out of operation ever since."' },
    ],
    paragraph:
      'The judge remarked {{0}} the case {{1}} a fortnight after the incident. Counsel Goel respectfully informed him that the robot {{2}} been switched out of operation ever since.',
    blanks: [
      [['that', 'if', 'why'], 'that'],
      [['started', 'had started', 'starts'], 'had started'],
      [['has', 'had', 'have'], 'had'],
    ],
    exp: 'વિધાનમાં that, started → had started, has been → had been.',
  },
  {
    num: 30,
    dialogue: [
      { speaker: 'Interviewer', text: '"Did you feel any hesitation in quitting a well-paying job?"' },
      { speaker: 'Arun', text: '"I quit my job at Google in 2010 because I wanted to do something for the environment."' },
    ],
    paragraph:
      'The interviewer asked Arun {{0}} he {{1}} any hesitation in quitting a well-paying job. Arun replied that he {{2}} his job at Google in 2010 because he had wanted to do something for the environment.',
    blanks: [
      [['that', 'if', 'what'], 'if'],
      [['felt', 'had felt', 'feels'], 'had felt'],
      [['quit', 'had quit', 'quits'], 'had quit'],
    ],
    exp: 'Did + feel → if + had felt, Simple Past quit → had quit.',
  },
  {
    num: 31,
    dialogue: [
      { speaker: 'Interviewer', text: '"How many days does it take to clear a large lake?"' },
      { speaker: 'Arun', text: '"It can take anywhere between 5 days and 3 months."' },
    ],
    paragraph:
      'The interviewer {{0}} Arun how many days it {{1}} to clear a large lake. Arun replied that it {{2}} take anywhere between 5 days and 3 months.',
    blanks: [
      [['told', 'asked', 'ordered'], 'asked'],
      [['take', 'took', 'takes'], 'took'],
      [['can', 'could', 'will'], 'could'],
    ],
    exp: 'પ્રશ્ન માટે asked, does it take → it took, can → could.',
  },
  {
    num: 32,
    dialogue: [
      { speaker: 'Angel', text: '"You are taking so much care for creating this creature."' },
      { speaker: 'Lord', text: '"Do you want to know the details?"' },
    ],
    paragraph:
      'The angel commented {{0}} the Lord {{1}} taking so much care for creating {{2}} creature. The Lord asked {{3}} he wanted to know the details.',
    blanks: [
      [['if', 'that', 'what'], 'that'],
      [['is', 'was', 'were'], 'was'],
      [['this', 'that', 'these'], 'that'],
      [['that', 'if', 'why'], 'if'],
    ],
    exp: 'વિધાનમાં that, are → was (Lord સાથે), this → that, Yes/No પ્રશ્નમાં if.',
  },
  {
    num: 33,
    dialogue: [
      { speaker: 'Angel', text: '"Oh Lord, her eyes are leaking! What is a tear for?"' },
      { speaker: 'Lord', text: '"It is a miracle! May be it is for pain, joy, or pride."' },
    ],
    paragraph:
      'The angel exclaimed with surprise that her eyes {{0}} leaking and asked what a tear {{1}} for. The Lord exclaimed that it was a miracle and added that perhaps it {{2}} for pain, joy, or pride.',
    blanks: [
      [['are', 'was', 'were'], 'were'],
      [['is', 'was', 'were'], 'was'],
      [['is', 'was', 'will be'], 'was'],
    ],
    exp: 'are → were (her eyes બહુવચન), is → was, અને is → was.',
  },
  {
    num: 34,
    dialogue: [
      { speaker: 'Sharan', text: '"Mummy, can we make popcorn at home?"' },
      { speaker: 'Mummy', text: '"Yes dear! We can make it in a few minutes."' },
    ],
    paragraph:
      'Sharan {{0}} his mummy {{1}} they {{2}} make popcorn at home. Mummy replied affectionately in affirmative and said that they {{3}} make it in a few minutes.',
    blanks: [
      [['told', 'asked', 'ordered'], 'asked'],
      [['that', 'if', 'when'], 'if'],
      [['can', 'could', 'would'], 'could'],
      [['can', 'could', 'will'], 'could'],
    ],
    exp: 'પ્રશ્ન માટે asked + if, બંને વાક્યમાં can → could.',
  },
  {
    num: 35,
    dialogue: [
      { speaker: 'Mother', text: '"What were you doing out there in the rain?"' },
      { speaker: 'Boy', text: '"I was getting wet, Mom."' },
    ],
    paragraph:
      'Mother {{0}} the boy what he {{1}} doing out there in the rain. The boy replied to his mom that he {{2}} getting wet.',
    blanks: [
      [['asked', 'told', 'ordered'], 'asked'],
      [['was', 'had been', 'is'], 'had been'],
      [['was', 'had been', 'has been'], 'had been'],
    ],
    exp: 'Past Continuous (were doing / was getting) → Past Perfect Continuous (had been doing / had been getting).',
  },
  {
    num: 36,
    dialogue: [
      { speaker: 'Mummy', text: '"Naresh, have you been fighting again?"' },
      { speaker: 'Naresh', text: '"No, I haven\'t, Mummy."' },
    ],
    paragraph:
      'Mummy asked Naresh {{0}} he {{1}} been fighting again. Naresh replied to his mummy {{2}} that he {{3}}.',
    blanks: [
      [['that', 'if', 'why'], 'if'],
      [['has', 'had', 'have'], 'had'],
      [['affirmatively', 'negatively', 'happily'], 'negatively'],
      [["hasn't", "hadn't", "didn't"], "hadn't"],
    ],
    exp: 'Yes/No પ્રશ્નમાં if, have → had, "No" → negatively, haven\'t → hadn\'t.',
  },
  {
    num: 37,
    dialogue: [
      { speaker: 'Juhi', text: '"I am going to clean the room today."' },
      { speaker: 'Meera', text: '"Will you help me arrange the books?"' },
    ],
    paragraph:
      'Juhi told Meera {{0}} she {{1}} going to clean the room {{2}}. Meera asked if she {{3}} help her arrange the books.',
    blanks: [
      [['if', 'that', 'what'], 'that'],
      [['is', 'was', 'were'], 'was'],
      [['today', 'that day', 'the next day'], 'that day'],
      [['will', 'would', 'can'], 'would'],
    ],
    exp: 'વિધાનમાં that, am → was, today → that day, will → would.',
  },
  {
    num: 38,
    dialogue: [
      { speaker: 'Pritam', text: '"I could not meet you yesterday as I was away from town."' },
      { speaker: 'Friend', text: '"That is completely fine."' },
    ],
    paragraph:
      'Pritam told his friend that he could not meet him {{0}} as he {{1}} away from town. His friend replied that {{2}} was completely fine.',
    blanks: [
      [['yesterday', 'the previous day', 'that day'], 'the previous day'],
      [['was', 'had been', 'is'], 'had been'],
      [['this', 'that', 'it'], 'that'],
    ],
    exp: 'yesterday → the previous day, was → had been, અને That → that.',
  },
  {
    num: 39,
    dialogue: [
      { speaker: 'Devayani', text: '"Father, Kach went out to gather firewood but he has not come back."' },
      { speaker: 'Shukracharya', text: '"Do not grieve, do not cry."' },
    ],
    paragraph:
      'Devayani told her father that Kach {{0}} out to gather firewood but he {{1}} not come back. Shukracharya advised her {{2}} grieve or cry.',
    blanks: [
      [['went', 'had gone', 'goes'], 'had gone'],
      [['has', 'had', 'have'], 'had'],
      [['to not', 'not to', "don't"], 'not to'],
    ],
    exp: 'went → had gone, has → had, અને "Do not" → not to.',
  },
  {
    num: 40,
    dialogue: [
      { speaker: 'Shukracharya', text: '"Receive from me the magic mantra. When you come out of me, try the mantra on my body."' },
      { speaker: 'Kach', text: '"I shall obey your order, O master."' },
    ],
    paragraph:
      'Shukracharya told Kach {{0}} the magic mantra from him and instructed him to try it on his body when he {{1}} out of him. Kach replied that he {{2}} obey his order.',
    blanks: [
      [['receive', 'to receive', 'receiving'], 'to receive'],
      [['came', 'come', 'had come'], 'came'],
      [['shall', 'would', 'will'], 'would'],
    ],
    exp: 'આજ્ઞાર્થમાં to receive, come → came, અને he સાથે shall → would.',
  },
  {
    num: 41,
    dialogue: [
      { speaker: 'Uncle', text: '"Reach for the interview a few minutes before time. Do not talk too much."' },
      { speaker: 'Devashish', text: '"Thank you for your valuable advice, uncle."' },
    ],
    paragraph:
      'Uncle advised Devashish {{0}} for the interview a few minutes before time and {{1}} talk too much. Devashish {{2}} him for his valuable advice.',
    blanks: [
      [['reach', 'to reach', 'reaching'], 'to reach'],
      [['not to', 'to not', "don't"], 'not to'],
      [['thank', 'thanking', 'thanked'], 'thanked'],
    ],
    exp: 'સલાહમાં to reach + not to, અને "Thank you" → thanked.',
  },
  {
    num: 42,
    dialogue: [
      { speaker: 'Teacher', text: '"Don\'t argue with me."' },
      { speaker: 'Boys', text: '"Sorry, Madam. We will follow the rules."' },
    ],
    paragraph:
      'The teacher angrily asked the boys {{0}} argue with {{1}}. The boys apologized and said that {{2}} {{3}} follow the rules.',
    blanks: [
      [['not to', 'to not', "don't"], 'not to'],
      [['me', 'her', 'him'], 'her'],
      [['we', 'they', 'you'], 'they'],
      [['will', 'would', 'shall'], 'would'],
    ],
    exp: '"Don\'t argue" → not to argue, Madam હોવાથી me → her, We → they, will → would.',
  },
  {
    num: 43,
    dialogue: [
      { speaker: 'Shubhangi', text: '"Why do people dislike vultures?"' },
      { speaker: 'Devangi', text: '"People do not like them because they eat dead animals."' },
    ],
    paragraph:
      'Shubhangi {{0}} Devangi {{1}} people {{2}} vultures. Devangi replied that people did not like them because they {{3}} dead animals.',
    blanks: [
      [['told', 'asked', 'inquired'], 'asked'],
      [['that', 'why', 'when'], 'why'],
      [['dislike', 'disliked', 'had disliked'], 'disliked'],
      [['eat', 'ate', 'eaten'], 'ate'],
    ],
    exp: 'પ્રશ્ન માટે asked + why, dislike → disliked, eat → ate.',
  },
  {
    num: 44,
    dialogue: [
      { speaker: 'Jignesh', text: '"I cannot decide which stream to choose after Class 10."' },
      { speaker: 'Prof. Ray', text: '"Choose the subjects according to your interest and aptitude."' },
    ],
    paragraph:
      'Jignesh said {{0}} he {{1}} decide which stream to choose after Class 10. Prof. Ray {{2}} him {{3}} the subjects according to his interest and aptitude.',
    blanks: [
      [['if', 'that', 'what'], 'that'],
      [['cannot', 'could not', 'would not'], 'could not'],
      [['ordered', 'advised', 'asked'], 'advised'],
      [['choose', 'to choose', 'choosing'], 'to choose'],
    ],
    exp: 'વિધાનમાં that, cannot → could not, સલાહ માટે advised + to choose.',
  },
  {
    num: 45,
    dialogue: [
      { speaker: 'Young Girl', text: '"Are you Lieutenant Blandford?"' },
      { speaker: 'Blandford', text: '"Yes, I am. Who are you?"' },
    ],
    paragraph:
      'The young girl asked Blandford {{0}} he {{1}} Lieutenant Blandford. Blandford replied affirmatively and asked {{2}} she {{3}}.',
    blanks: [
      [['that', 'if', 'who'], 'if'],
      [['is', 'was', 'were'], 'was'],
      [['whom', 'who', 'whose'], 'who'],
      [['is', 'was', 'were'], 'was'],
    ],
    exp: 'Yes/No પ્રશ્નમાં if + was, અને "Who are you?" માટે who + she was.',
  },
];

const q46Questions: QuizQuestion[] = Q46_SPECS.map((item) => {
  const blanks: TapFillBlankSpec[] = item.blanks.map(([options, correctAnswer]) => ({
    options: [...options],
    correctAnswer,
  }));
  return {
    id: `eng_q46_${item.num}`,
    questionMode: 'tap_fill_per_blank',
    dialogueLines: item.dialogue,
    questionText: `${item.num}) ${item.paragraph}`,
    options: [],
    correctIndex: 0,
    blanks,
    explanation: `${item.exp}\nસાચા જવાબો: ${blanks.map((b, i) => `(${i + 1}) ${b.correctAnswer}`).join(', ')}`,
    sourceLabel: item.board
      ? `Section D • Q. 46 (${item.board})`
      : 'Section D • Q. 46 (Textbook Practice)',
  };
});

export const englishIndirectNarrationChapter: QuizChapter = {
  id: 'eng_q46',
  subjectId: 'english',
  chapterNumber: 'Section D • Q. 46',
  title: 'Indirect Narration (પરોક્ષ કથન)',
  subtitle: 'Read the dialogue and tap the correct option for each blank (45 Questions)',
  questions: q46Questions,
  questionTypeLabel: 'Tap-to-Fill (3 વિકલ્પ/ખાલી જગ્યા)',
};
