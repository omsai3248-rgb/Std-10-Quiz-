import type { QuizChapter, QuizQuestion } from '../../types/models';

// ============================================================
// SECTION C — Q. 39 to 41: Complete the Sentences (46 Questions)
// Rule 3: Exact 4 MCQ options from PDF
// ============================================================

type SentSpec = [
  num: number,
  prompt: string,
  options: [string, string, string, string],
  ansIdx: number,
  exp: string,
  board?: string
];

const SENT_SPECS: SentSpec[] = [
  [1, '_________________ will come for your help. (showing alternatives)', ['Both Mehul and Mayur', 'Not only Mehul but Mayur also', 'Either Mehul or Mayur', 'Either Mehul nor Mayur'], 2, 'Showing alternatives માટે "Either ... or" ની સાચી જોડી વિકલ્પ (C) માં છે.', 'Feb-Mar 2026'],
  [2, 'The small arrow _________________ (specifying location)', ['hit him hard.', 'on the top of the pole is astonishing.', 'is very pointed and sharp.', 'cannot be touched by anybody.'], 1, 'Specifying location માટે "on the top of the pole" ચોક્કસ સ્થળ દર્શાવે છે.', 'Feb-Mar 2026'],
  [3, 'Abhay danced most gracefully _________________ (showing result)', ['although he did not get the prize.', 'but he got the first prize.', 'because he is a trained Kathak Artist.', 'therefore he was given the first prize.'], 3, 'Showing result (પરિણામ) માટે "therefore" નો ઉપયોગ સાચો છે.', 'Feb-Mar 2026'],
  [4, 'Hon. C.M. will visit Vadodara _________________ (Showing time)', ['for inauguration of a crocodile sanctuary.', 'happily again and again.', 'during the month of April.', 'because he loves this city much.'], 2, 'Showing time માટે "during the month of April" સમય દર્શાવે છે.', 'June 2025'],
  [5, 'Pinal will deliver a speech _________________ (Showing alternatives)', ['either on Queen Ahalyabai nor on Jijamata.', 'either on Queen Ahalyabai or on Jijamata.', 'neither on Queen Ahalyabai or on Jijamata.', 'not only on Queen Ahalyabai but also on Jijamata.'], 1, 'Showing alternatives માટે "either ... or" ની સાચી રચના વિકલ્પ (B) માં છે.', 'June 2025'],
  [6, 'Take out your textbook, _________________ (Describing process)', ['because it is important.', 'all the answers are given there.', 'and start writing w-3.', 'instead of any other books.'], 2, 'Describing process માટે આજ્ઞાર્થ ક્રિયાનો આગળનો ક્રમ "and start writing w-3." સાચો છે.', 'June 2025'],
  [7, 'You can opt for _________________ (Showing alternatives)', ['science and arts', 'either science or commerce', 'diploma but commerce', 'science nor commerce'], 1, 'Showing alternatives માટે "either science or commerce" સાચો વિકલ્પ છે.', 'Feb-Mar 2025'],
  [8, 'The train _________________ (Specifying location)', ['will be on time', 'will arrive at Delhi soon', 'is running late today', 'has not any halt for ten minutes'], 1, 'Specifying location માટે "at Delhi" સ્થળ દર્શાવે છે.', 'Feb-Mar 2025'],
  [9, 'Kajal asked Munna _________________ (Reporting event)', ['that she would be late that day', 'what he will buy for her', 'if he was busy that day', 'whether he has any meeting today'], 2, 'Reporting event માં "asked" સાથે ભૂતકાળની Indirect રચના "if he was busy that day" સાચી છે.', 'Feb-Mar 2025'],
  [10, 'Girish will go for the parikrama _________________ (showing alternatives)', ['of both the Narmada river and the Girnar.', 'either of the Narmada river or of the Girnar.', 'either of the Narmada river nor of the Girnar.', 'neither of the Narmada river or of the Girnar.'], 1, 'Showing alternatives માટે "either ... or" સાચું સંયોજક છે.', 'March 2024'],
  [11, 'Mahi sang very sweetly _________________ (showing result)', ['but she got the first prize.', 'although she did not get the prize.', 'therefore she was given the first prize.', 'because she is a trained classical singer.'], 2, 'Showing result માટે "therefore" પરિણામ દર્શાવે છે.', 'March 2024'],
  [12, 'Take a cabbage, _________________ (describing process)', ['and sell it to your neighbour.', 'and check whether it is ok or not.', 'throw it out of the window.', 'chop into small pieces and garnish with coriander leaves.'], 3, 'Describing process માટે રાંધવાની ક્રમિક પ્રક્રિયા વિકલ્પ (D) માં છે.', 'March 2024'],
  [13, 'Mohanlal is old _________________ (indicating contrast)', ['so he cannot walk fast.', 'yet he works very actively.', 'therefore he takes rest.', 'because he is weak.'], 1, 'Indicating contrast (વિરોધાભાસ) માટે "yet" નો ઉપયોગ સાચો છે.', 'March 2023'],
  [14, 'Rinku knows _________________ (talking about alternatives)', ['both Hindi and English.', 'neither French nor German.', 'either Sanskrit or Gujarati.', 'not only Maths but Science also.'], 2, 'Talking about alternatives માટે "either Sanskrit or Gujarati." સાચો વિકલ્પ છે.', 'March 2023'],
  [15, '_________________ milk do you drink? (asking about the quantity)', ['How many', 'How much', 'How long', 'How often'], 1, 'Milk અગણ્ય (uncountable) નામ હોવાથી જથ્થો પૂછવા "How much" વપરાય છે.', 'March 2023'],
  [16, 'The main entrance of the school is _________________ (Specifying location)', ['very wide and clean.', 'on the south side near the security cabin.', 'opened at 7:00 am.', 'painted in blue colour.'], 1, 'Specifying location માટે "on the south side near the security cabin." સ્થળ દર્શાવે છે.'],
  [17, 'Robert attends prayer _________________ (Specifying time and location)', ['with his parents.', 'in the church near town hall every Sunday.', 'because he is religious.', 'very peacefully.'], 1, 'વિકલ્પ (B) માં સ્થળ ("in the church near town hall") અને સમય ("every Sunday") બંને છે.'],
  [18, 'Vikram _________________ (Describing frequency of action)', ['reached the school yesterday.', 'usually reaches the school on time.', 'will reach the school tomorrow.', 'is reaching the school now.'], 1, '"usually" ક્રિયાની આવૃત્તિ (frequency of action) દર્શાવે છે.'],
  [19, 'The National Film Awards _________________ (Describing action - Passive)', ['are presented in a formal ceremony in Delhi.', 'is very prestigious.', 'were started by actors.', 'gives recognition to artists.'], 0, 'બહુવચન કર્તા "The National Film Awards" સાથે સાચી Passive રચના "are presented..." છે.'],
  [20, 'Rinse the poha in clean water _________________ (Describing process)', ['because it is dirty.', 'and drain it using a strainer.', 'so it tastes good.', 'before buying it.'], 1, 'Describing process માટે આગળનું પગલું "and drain it using a strainer." સાચું છે.'],
  [21, 'Pritam told his friend _________________ (Reporting events)', ['that he could not meet him the previous day.', 'I am busy today.', 'why he was late yesterday.', 'to come tomorrow.'], 0, 'Reporting events માં "told" સાથે સાચું પરોક્ષ કથન "that he could not meet him the previous day." છે.'],
  [22, 'The doctor warned the people _________________ (Reporting events)', ['that use boiled water.', 'to use only boiled water for drinking.', 'why they drank dirty water.', 'not drinking river water.'], 1, 'આજ્ઞાર્થ વાક્યના Reporting માટે "warned ... to use..." સાચી રચના છે.'],
  [23, 'A weaver bird is a small bird _________________ (Describing bird - Relative Pronoun)', ['where it lives on trees.', 'which builds an artistic nest with grass.', 'whom people love to see.', 'whose colour is black.'], 1, 'પક્ષી માટે Relative Pronoun "which" નો સાચો ઉપયોગ વિકલ્પ (B) માં છે.'],
  [24, '_________________ does the Shatabdi Express leave? (Inquiry as nature)', ['Where', 'What time', 'Who', 'Whom'], 1, 'ટ્રેન ઉપડવાનો સમય પૂછવા "What time" યોગ્ય છે.'],
  [25, 'If you study regularly, _________________ (Describing condition)', ['you would pass easily.', 'you will score good marks in the board exam.', 'you failed in the test.', 'you had got a prize.'], 1, 'Type-1 Condition (If + Simple Present) સાથે મુખ્ય વાક્યમાં "will + V1" આવે છે.'],
  [26, 'Lieutenant Blandford _________________ (Talking about time - Present Perfect)', ['arrived at the station at 6 pm.', "has just reached New York's Grand Central Station.", 'will meet Hollis Meynell.', 'was waiting for her.'], 1, 'Present Perfect ("has just reached") વાળો વિકલ્પ (B) સાચો છે.'],
  [27, 'The Monsoon Festival is organized _________________ (Specifying time)', ['by Gujarat Tourism Corporation.', 'every year in the month of August.', 'at Saputara hill station.', 'to attract more tourists.'], 1, 'Specifying time માટે "every year in the month of August." સમય દર્શાવે છે.'],
  [28, 'Ajanta Caves are located _________________ (Specifying location)', ['in Aurangabad district of Maharashtra state.', 'and are very famous.', 'for Buddhist monuments.', 'which tourists visit.'], 0, 'Specifying location માટે "in Aurangabad district of Maharashtra state." સ્થળ દર્શાવે છે.'],
  [29, 'Saina Nehwal _________________ (Describing frequency of action)', ['won an Olympic medal.', 'never thinks about defeat when she is in the game.', 'is a badminton player.', 'practises on the court.'], 1, '"never" શબ્દ frequency of action દર્શાવે છે.'],
  [30, 'Lions _________________ (Describing frequency of action)', ['live in Gir forest.', 'frequently enter villages of Gir but are never seen in cities.', 'are wild animals.', 'roar loudly at night.'], 1, '"frequently" અને "never" ક્રિયાની આવૃત્તિ દર્શાવે છે.'],
  [31, 'All the thieves _________________ (Describing action - Passive)', ['ran away from the jail.', 'had been caught by the police.', 'were very clever.', 'stole the diamonds.'], 1, 'Passive voice ("had been caught by the police") વિકલ્પ (B) માં છે.'],
  [32, 'Visitors are requested _________________ (Describing action - Passive)', ['to visit the zoo.', 'not to feed the animals in the zoo.', 'because animals are hungry.', 'by the zoo keeper.'], 1, 'જાહેર સૂચનાની Passive રચના "Visitors are requested not to feed..." સાચી છે.'],
  [33, 'Detach the drawer shelves _________________ (Describing process)', ['because the fridge is dirty.', 'and soak them in warm water mixed with detergent.', 'which are made of plastic.', 'before buying a new fridge.'], 1, 'સફાઈની ક્રમિક પ્રક્રિયા વિકલ્પ (B) માં દર્શાવી છે.'],
  [34, 'Heat two tablespoons of oil in a pan _________________ (Describing process)', ['and add chopped potatoes to fry till golden.', 'for making tasty food.', 'in the kitchen.', 'which is healthy.'], 0, 'રાંધવાની પ્રક્રિયાનું આગળનું પગલું "and add chopped potatoes..." સાચું છે.'],
  [35, 'Amit said _________________ (Reporting events)', ['my wife is a judge.', 'that his wife had just been appointed a judge.', 'to his friend happily.', 'about the court case.'], 1, 'Reporting events માટે "that his wife had just been appointed..." સાચું પરોક્ષ કથન છે.'],
  [36, 'The workers said _________________ (Reporting events)', ['we work on Sundays.', 'that they liked working on Sundays because they got double pay.', 'to the factory owner.', 'about their salary.'], 1, 'Reporting events માટે ભૂતકાળમાં પરોક્ષ કથન વિકલ્પ (B) સાચું છે.'],
  [37, 'The driving instructor advised Amrapali _________________ (Reporting events)', ['that drive carefully.', 'not to be so stiff like a statue.', 'why she was nervous.', 'driving in traffic.'], 1, 'નકાર આજ્ઞાર્થ સલાહના Reporting માં "advised ... not to be..." સાચું છે.'],
  [38, 'The secretary asked the boss _________________ (Reporting events)', ['that she can leave early.', 'if she could leave a little bit early that day in the evening.', 'to sign the paper yesterday.', 'why he was angry.'], 1, 'પ્રશ્નાર્થ પરોક્ષ કથનમાં "if she could ... that day" સાચી રચના છે.'],
  [39, 'The tailor bird is a tiny bird _________________ (Describing bird - Relative Pronoun)', ['who sings sweetly.', 'that stitches two large leaves together to make its nest.', 'where it lays eggs.', 'whom children like.'], 1, 'પક્ષીના વર્ણન માટે Relative Pronoun "that stitches..." સાચું છે.'],
  [40, 'Gandhinagar is the green city _________________ (Describing place - Relative Pronoun)', ['which is very clean.', 'where the Gujarat Legislative Assembly is situated.', 'who is the capital.', 'when we visited it.'], 1, 'સ્થળ માટે Relative Pronoun "where" વાળો વિકલ્પ (B) સાચો છે.'],
  [41, '_________________ do you spend in reading English newspapers? (Inquiry as nature)', ['How many', 'How much time', 'Who', 'Where'], 1, 'સમયની પૂછપરછ માટે "How much time" સાચો વિકલ્પ છે.'],
  [42, 'You can choose _________________ (Showing alternatives)', ['both Science and Commerce.', 'either Science or Arts after Class 10.', 'neither Maths nor Biology.', 'not only English but also Hindi.'], 1, 'Showing alternatives (વિકલ્પ પસંદગી) માટે "either Science or Arts" સાચું છે.'],
  [43, 'Helen Keller _________________ (Talking about time - Present Perfect)', ['wrote many poems.', 'has inspired millions of differently-abled people around the world.', 'visited the White House.', 'was blind and deaf.'], 1, 'Present Perfect ("has inspired") વિકલ્પ (B) માં છે.'],
  [44, 'If you work hard with dedication, _________________ (Describing condition)', ['you achieved success.', 'you will surely achieve your goal.', 'you had passed the exam.', 'you would win a medal.'], 1, 'Simple Present ની શરત સાથે "you will surely achieve your goal." સાચું છે.'],
  [45, 'Dashrath Manjhi worked for 22 years _________________ (Showing result)', ['because he loved his wife.', 'therefore the distance between Atri and Wazirganj was reduced to 15 km.', 'although people called him a lunatic.', 'and he became famous.'], 1, 'Showing result માટે "therefore" નો ઉપયોગ વિકલ્પ (B) માં છે.'],
  [46, 'Although Prem Chopra denied all charges, _________________ (Indicating contrast)', ['so he was arrested.', 'the court declared him guilty of theft.', 'because Ram Singh was called.', 'therefore he went home.'], 1, 'Although સાથે વિરોધાભાસ દર્શાવતું મુખ્ય વાક્ય વિકલ્પ (B) છે (Although સાથે so/but ન આવે).'],
];

const sentQuestions: QuizQuestion[] = SENT_SPECS.map(([num, prompt, options, ansIdx, exp, board]) => ({
  id: `eng_q39_41_${num}`,
  questionMode: 'mcq',
  questionText: `${num}) ${prompt}`,
  options: [...options],
  correctIndex: ansIdx,
  explanation: exp,
  sourceLabel: board ? `Section C • Q. 39 to 41 (${board})` : 'Section C • Q. 39 to 41 (Textbook Practice)',
}));

export const englishCompleteSentencesChapter: QuizChapter = {
  id: 'eng_q39_41',
  subjectId: 'english',
  chapterNumber: 'Section C • Q. 39 to 41',
  title: 'Complete the Sentences (Functions)',
  subtitle: 'Complete the sentences choosing the correct option focusing the functions (46 Questions)',
  questions: sentQuestions,
  questionTypeLabel: 'MCQs (4 વિકલ્પ)',
};

// ============================================================
// SECTION C — Q. 43 to 45: Nearest Meaning / Synonyms (48 Questions)
// Rule 3: Exact 4 MCQ options from PDF
// ============================================================

type SynSpec = [
  num: number,
  word: string,
  options: [string, string, string, string],
  ansIdx: number,
  meaningGu: string,
  board?: string
];

const SYN_SPECS: SynSpec[] = [
  [1, 'erect', ['straight', 'bended', 'throw away', 'correct'], 0, 'erect = સીધું / ટટ્ટાર (straight)', 'Feb-Mar 2026'],
  [2, 'resist', ['again', 'stick', 'help', 'stop'], 3, 'resist = રોકવું / પ્રતિકાર કરવો (stop)', 'Feb-Mar 2026'],
  [3, 'hind', ['upside', 'backside', 'a country', 'frontside'], 1, 'hind = પાછળનું (backside)', 'Feb-Mar 2026'],
  [4, 'deny', ['approve', 'reject', 'applaud', 'villain'], 1, 'deny = નકારવું (reject)', 'June 2025'],
  [5, 'isolation', ['very cold', 'speculation', 'loneliness', 'shivering'], 2, 'isolation = એકલતા (loneliness)', 'June 2025'],
  [6, 'generate', ['provide', 'promise', 'procure', 'produce'], 3, 'generate = ઉત્પન્ન કરવું (produce)', 'June 2025'],
  [7, 'slim', ['delicate', 'very thin', 'fattish', 'plump'], 1, 'slim = પાતળું (very thin)', 'Feb-Mar 2025'],
  [8, 'mob', ['crowd', 'pair', 'group', 'shelter'], 0, 'mob = ટોળું (crowd)', 'Feb-Mar 2025'],
  [9, 'shiver', ['refuse', 'seek', 'tremble', 'fear'], 2, 'shiver = ધ્રૂજવું (tremble)', 'Feb-Mar 2025'],
  [10, 'dreadful', ['beautiful', 'charming', 'terrible', 'gloomy'], 2, 'dreadful = ભયાનક (terrible)', 'March 2024'],
  [11, 'give up', ['leave', 'take', 'bring', 'borrow'], 0, 'give up = છોડી દેવું (leave)', 'March 2024'],
  [12, 'fraud', ['duplicate', 'dishonest', 'gangster', 'chinese'], 1, 'fraud = છેતરપિંડી કરનાર / અપ્રમાણિક (dishonest)', 'March 2024'],
  [13, 'antique', ['fattish', 'modern', 'ancient', 'fearful'], 2, 'antique = પ્રાચીન / જૂનું (ancient)', 'March 2023'],
  [14, 'peace', ['war', 'piece', 'whole', 'quiet'], 3, 'peace = શાંતિ (quiet)', 'March 2023'],
  [15, 'enemy', ['friend', 'family', 'foe', 'enable'], 2, 'enemy = દુશ્મન (foe)', 'March 2023'],
  [16, 'destiny', ['merit', 'penal', 'fate', 'duty'], 2, 'destiny = ભાગ્ય / નિયતિ (fate)'],
  [17, 'sturdy', ['weekly', 'strong', 'burning', 'weak'], 1, 'sturdy = મજબૂત (strong)'],
  [18, 'squander', ['save', 'waste', 'collect', 'earn'], 1, 'squander = વેડફવું (waste)'],
  [19, 'bewilder', ['confuse', 'clarify', 'please', 'guide'], 0, 'bewilder = ગૂંચવી નાખવું (confuse)'],
  [20, 'betray', ['support', 'deceive', 'help', 'trust'], 1, 'betray = વિશ્વાસઘાત કરવો (deceive)'],
  [21, 'humility', ['pride', 'humbleness', 'anger', 'cruelty'], 1, 'humility = નમ્રતા (humbleness)'],
  [22, 'mighty', ['clever', 'powerful', 'weak', 'competent'], 1, 'mighty = શક્તિશાળી (powerful)'],
  [23, 'endure', ['avoid', 'tolerate', 'complain', 'refuse'], 1, 'endure = સહન કરવું (tolerate)'],
  [24, 'emit', ['absorb', 'release', 'hide', 'collect'], 1, 'emit = બહાર ફેંકવું / મુક્ત કરવું (release)'],
  [25, 'notorious', ['famous', 'polite', 'infamous', 'well-known'], 2, 'notorious = કુખ્યાત (infamous)'],
  [26, 'utter', ['listen', 'speak', 'write', 'read'], 1, 'utter = ઉચ્ચારવું / બોલવું (speak)'],
  [27, 'boundless', ['limited', 'limitless', 'narrow', 'small'], 1, 'boundless = અપાર / અમર્યાદિત (limitless)'],
  [28, 'slain', ['saved', 'killed', 'injured', 'cured'], 1, 'slain = મારી નાખેલ (killed)'],
  [29, 'innate', ['learned', 'inborn', 'artificial', 'external'], 1, 'innate = જન્મજાત (inborn)'],
  [30, 'ardent', ['cold', 'passionate', 'lazy', 'careless'], 1, 'ardent = ઉત્સાહી / ઉત્કટ (passionate)'],
  [31, 'lobbied', ['opposed', 'persuaded', 'ignored', 'fought'], 1, 'lobbied = મનાવવાનો પ્રયાસ કર્યો (persuaded)'],
  [32, 'scorching', ['freezing', 'burning', 'pleasant', 'cloudy'], 1, 'scorching = ધગધગતું / બળતું (burning)'],
  [33, 'beacon', ['obstacle', 'guiding light', 'darkness', 'building'], 1, 'beacon = માર્ગદર્શક પ્રકાશ (guiding light)'],
  [34, 'accomplice', ['enemy', 'helper in crime', 'victim', 'judge'], 1, 'accomplice = ગુનામાં સાથીદાર (helper in crime)'],
  [35, 'disintegrate', ['unite', 'break into pieces', 'build', 'repair'], 1, 'disintegrate = ટુકડા થઈ જવા / નાશ પામવો (break into pieces)'],
  [36, 'snobbish', ['humble', 'arrogant', 'friendly', 'polite'], 1, 'snobbish = ઘમંડી (arrogant)'],
  [37, 'quit', ['join', 'leave', 'continue', 'start'], 1, 'quit = છોડી દેવું (leave)'],
  [38, 'trash', ['treasure', 'garbage', 'tool', 'furniture'], 1, 'trash = કચરો (garbage)'],
  [39, 'heal', ['injure', 'cure', 'hurt', 'break'], 1, 'heal = સાજું કરવું (cure)'],
  [40, 'compromise', ['quarrel', 'adjust', 'refuse', 'demand'], 1, 'compromise = સમાધાન કરવું (adjust)'],
  [41, 'pioneer', ['follower', 'developer', 'student', 'critic'], 1, 'pioneer = અગ્રણી / પ્રણેતા (developer)'],
  [42, 'blend', ['separation', 'combination', 'ratio', 'powder'], 1, 'blend = મિશ્રણ (combination)'],
  [43, 'imitate', ['invent', 'copy', 'ignore', 'forget'], 1, 'imitate = નકલ કરવી (copy)'],
  [44, 'indebted', ['ungrateful', 'obliged', 'wealthy', 'free'], 1, 'indebted = ઋણી / આભારી (obliged)'],
  [45, 'revive', ['kill', 'bring back to life', 'bury', 'forget'], 1, 'revive = પુનર્જીવિત કરવું (bring back to life)'],
  [46, 'despair', ['hope', 'hopelessness', 'joy', 'courage'], 1, 'despair = નિરાશા (hopelessness)'],
  [47, 'peculiar', ['common', 'strange', 'ordinary', 'simple'], 1, 'peculiar = વિચિત્ર / અનોખું (strange)'],
  [48, 'sustain', ['destroy', 'maintain', 'stop', 'abandon'], 1, 'sustain = ટકાવી રાખવું (maintain)'],
];

const synQuestions: QuizQuestion[] = SYN_SPECS.map(([num, word, options, ansIdx, meaningGu, board]) => ({
  id: `eng_q43_45_${num}`,
  questionMode: 'mcq',
  questionText: `${num}) Find the nearest meaning of: "${word}"`,
  options: [...options],
  correctIndex: ansIdx,
  explanation: `સાચો સમાનાર્થી શબ્દ "${options[ansIdx]}" છે.\nઅર્થ: ${meaningGu}.`,
  sourceLabel: board ? `Section C • Q. 43 to 45 (${board})` : 'Section C • Q. 43 to 45 (Textbook Practice)',
}));

export const englishNearestMeaningChapter: QuizChapter = {
  id: 'eng_q43_45',
  subjectId: 'english',
  chapterNumber: 'Section C • Q. 43 to 45',
  title: 'Nearest Meaning (સમાનાર્થી શબ્દો)',
  subtitle: 'Find and write the word having the nearest meaning (48 Questions)',
  questions: synQuestions,
  questionTypeLabel: 'MCQs (4 વિકલ્પ)',
};
