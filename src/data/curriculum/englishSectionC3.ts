import type { QuizChapter, QuizQuestion } from '../../types/models';

// ============================================================
// SECTION C — Q. 42: Complete the Paragraph (Vocabulary — 45 Questions)
// Rule 4: Interactive Tap-to-Fill with 3 bracketed word buttons below
// ============================================================

type Q42Spec = [
  num: number,
  paragraph: string,
  wordBank: [string, string, string],
  answers: [string, string, string],
  exp: string,
  board?: string
];

const Q42_SPECS: Q42Spec[] = [
  [1, 'The real {{0}} of work is that even in the most awkward times, you can {{1}} to the task {{2}} to you.', ['adhere', 'assigned', 'spree'], ['spree', 'adhere', 'assigned'], 'સાચો ક્રમ: (1) spree (ઉત્સાહ/આનંદ), (2) adhere (વળગી રહેવું), (3) assigned (સોંપેલું).', 'Feb-Mar 2026'],
  [2, 'An animal or a bird that feeds on the {{0}} of {{1}} is known as a {{2}}.', ['scavenger', 'carrion', 'carcasses'], ['carrion', 'carcasses', 'scavenger'], 'સાચો ક્રમ: (1) carrion (સડેલું માંસ), (2) carcasses (મૃતદેહો), (3) scavenger (સફાઈ કામદાર પક્ષી/પ્રાણી).', 'June 2025'],
  [3, "You should not get {{0}} because someone doesn't pay {{1}} to your matter. You should {{2}} your way of dealing with someone and mend it if needed.", ['observe', 'irritated', 'attention'], ['irritated', 'attention', 'observe'], 'સાચો ક્રમ: (1) irritated (ચીડાવું), (2) attention (ધ્યાન), (3) observe (નિરીક્ષણ કરવું).', 'Feb-Mar 2025'],
  [4, 'Some neighbouring countries {{0}} against our country at the UN. They {{1}} all their efforts and might to defame our country but failed because it was beyond their {{2}}.', ['pooled in', 'capacity', 'lobbied'], ['lobbied', 'pooled in', 'capacity'], 'સાચો ક્રમ: (1) lobbied (પ્રચાર/દબાણ કર્યું), (2) pooled in (એકત્ર કર્યું), (3) capacity (ક્ષમતા).', 'March 2024'],
  [5, "Dashrath Manjhi ran away from his home at a young age and worked at Dhanbad's coal {{0}}. He returned to his village, took up the work and {{1}} Falguni Devi. While {{2}} Gehlour hills to bring him lunch, Falguni slipped and injured herself.", ['married', 'mines', 'crossing'], ['mines', 'married', 'crossing'], 'સાચો ક્રમ: (1) mines (ખાણો), (2) married (લગ્ન કર્યા), (3) crossing (પાર કરતી વખતે).', 'March 2023'],
  [6, 'Sudha Murthy found that Hanumanthappa was a brilliant boy, but he could not study further due to poverty. She wanted to {{0}} in his study. She talked about this {{1}} in her staff and they {{2}} one lakh rupees.', ['issue', 'pooled in', 'contribute'], ['contribute', 'issue', 'pooled in'], 'સાચો ક્રમ: (1) contribute (ફાળો આપવો), (2) issue (મુદ્દો), (3) pooled in (ભેગા કર્યા).'],
  [7, "The {{0}} of this region is humid, so an asthma patient cannot stay here. Dr. Batra's {{1}} to Astha proved fruitful, and she fulfilled her {{2}} to study in a good school.", ['desire', 'climate', 'counsel'], ['climate', 'counsel', 'desire'], 'સાચો ક્રમ: (1) climate (આબોહવા), (2) counsel (સલાહ), (3) desire (ઇચ્છા).'],
  [8, 'The panchayat passed a {{0}} in 2008 to build a railway station. The villagers had a {{1}} desire to {{2}} their own destiny.', ['craft', 'resolution', 'burning'], ['resolution', 'burning', 'craft'], 'સાચો ક્રમ: (1) resolution (ઠરાવ), (2) burning (તીવ્ર), (3) craft (ઘડવું).'],
  [9, "Palakkad's district library stands tall as a {{0}} to {{1}} women through workshops and reading rooms so that they do not {{2}} their hours in front of television.", ['squander', 'beacon', 'empower'], ['beacon', 'empower', 'squander'], 'સાચો ક્રમ: (1) beacon (માર્ગદર્શક પ્રકાશ), (2) empower (સશક્ત બનાવવું), (3) squander (વેડફવું).'],
  [10, 'Nisarg visited a shopping mall and saw many {{0}}. He was {{1}} by the huge variety of items, but the {{2}} of the mall was its electronic section.', ['speciality', 'salesmen', 'bewildered'], ['salesmen', 'bewildered', 'speciality'], 'સાચો ક્રમ: (1) salesmen (વેચાણકારો), (2) bewildered (આશ્ચર્યચકિત), (3) speciality (ખાસિયત).'],
  [11, 'Prem Chopra bought Ram Singh-070 as a servant and an {{0}}. The robot worked with tremendous speed and {{1}}, but in the court, a mental {{2}} brought his end.', ['conflict', 'accomplice', 'accuracy'], ['accomplice', 'accuracy', 'conflict'], 'સાચો ક્રમ: (1) accomplice (ગુનાનો સાથીદાર), (2) accuracy (ચોકસાઈ), (3) conflict (સંઘર્ષ).'],
  [12, 'Pollution is a major problem of our times. Air, water and land all are {{0}}. Poor waste {{1}} is to blame for many problems. Each of us has to act sincerely to protect our {{2}}.', ['environment', 'polluted', 'disposal'], ['polluted', 'disposal', 'environment'], 'સાચો ક્રમ: (1) polluted (પ્રદૂષિત), (2) disposal (નિકાલ), (3) environment (પર્યાવરણ).'],
  [13, "Arun's teachers taught him {{0}} so that he did not become {{1}} or arrogant. He decided to {{2}} his job at Google to work full-time for the environment.", ['quit', 'humility', 'snobbish'], ['humility', 'snobbish', 'quit'], 'સાચો ક્રમ: (1) humility (નમ્રતા), (2) snobbish (ઘમંડી), (3) quit (છોડી દેવું).'],
  [14, 'Volunteers wear {{0}} gear like nose masks and sanitary gloves. They use rakes and spades to collect the {{1}} and {{2}} it into collection buckets.', ['dump', 'protective', 'trash'], ['protective', 'trash', 'dump'], 'સાચો ક્રમ: (1) protective (રક્ષણાત્મક), (2) trash (કચરો), (3) dump (ઠાલવવું).'],
  [15, 'The good Lord was working with full {{0}} on his sixth day of overtime. He wanted to {{1}} the mother with a kiss that could {{2}} everything.', ['cure', 'concentration', 'endow'], ['concentration', 'endow', 'cure'], 'સાચો ક્રમ: (1) concentration (એકાગ્રતા), (2) endow (બક્ષિસ આપવી), (3) cure (સાજું કરવું).'],
  [16, 'A mother is very {{0}} and can {{1}} many hardships. Not only can she think, but she can also reason and {{2}} in difficult situations.', ['compromise', 'tough', 'endure'], ['tough', 'endure', 'compromise'], 'સાચો ક્રમ: (1) tough (મજબૂત), (2) endure (સહન કરવું), (3) compromise (સમાધાન કરવું).'],
  [17, 'The Chinese are considered the {{0}} of pyrotechnics. Later, an English monk Roger Bacon revealed the formula of black powder in a code language because he considered it a dangerous {{1}}, though the basic {{2}} has remained unchanged.', ['blend', 'pioneers', 'substance'], ['pioneers', 'substance', 'blend'], 'સાચો ક્રમ: (1) pioneers (પ્રણેતાઓ), (2) substance (પદાર્થ), (3) blend (મિશ્રણ).'],
  [18, 'The fireworks industry is {{0}} for its accidents. Even a little {{1}} or spark can cause the {{2}} materials like fuel and oxidizers to catch fire.', ['raw', 'notorious', 'friction'], ['notorious', 'friction', 'raw'], 'સાચો ક્રમ: (1) notorious (કુખ્યાત), (2) friction (ઘર્ષણ), (3) raw (કાચો માલ).'],
  [19, "When Helen succeeded in {{0}} her teacher's finger movements, she was thrilled. Everything around her seemed to {{1}} with life, and her teacher satisfied her {{2}}.", ['curiosity', 'imitating', 'throb'], ['imitating', 'throb', 'curiosity'], 'સાચો ક્રમ: (1) imitating (નકલ કરવી), (2) throb (ધબકવું), (3) curiosity (જિજ્ઞાસા).'],
  [20, 'Anne Sullivan did not {{0}} to the problem of her weakening eyes. She {{1}} her eyesight for Helen, and Helen felt deeply {{2}} to her teacher.', ['indebted', 'heed', 'sacrificed'], ['heed', 'sacrificed', 'indebted'], 'સાચો ક્રમ: (1) heed (ધ્યાન આપવું), (2) sacrificed (બલિદાન આપ્યું), (3) indebted (ઋણી).'],
  [21, 'In ancient times, many {{0}} lived in their {{1}} and taught all the skills of life to their {{2}} with love and care.', ['disciples', 'hermitages', 'sages'], ['sages', 'hermitages', 'disciples'], 'સાચો ક્રમ: (1) sages (ઋષિઓ), (2) hermitages (આશ્રમો), (3) disciples (શિષ્યો).'],
  [22, 'The Asurs {{0}} Kach and killed him. When he did not return, Devayani was in {{1}}, so Shukracharya {{2}} him back to life using the magic spell.', ['summoned', 'waylaid', 'despair'], ['waylaid', 'despair', 'summoned'], 'સાચો ક્રમ: (1) waylaid (રસ્તામાં ઘેરી લીધો), (2) despair (નિરાશા), (3) summoned (બોલાવ્યો).'],
  [23, 'Birds {{0}} from cold regions to warmer places in winter. They have an {{1}} sense of direction, and their {{2}} help them find food easily.', ['beaks', 'migrate', 'innate'], ['migrate', 'innate', 'beaks'], 'સાચો ક્રમ: (1) migrate (સ્થળાંતર કરે છે), (2) innate (જન્મજાત), (3) beaks (ચાંચ).'],
  [24, 'Students should {{0}} their study hours properly and avoid {{1}} to achieve their goals without any {{2}}.', ['hesitation', 'schedule', 'distractions'], ['schedule', 'distractions', 'hesitation'], 'સાચો ક્રમ: (1) schedule (આયોજન કરવું), (2) distractions (વિક્ષેપો), (3) hesitation (ખચકાટ).'],
  [25, 'Lieutenant Blandford waited {{0}} at the station. He recognized the woman by the red rose on her {{1}}, which was a true test of his {{2}}.', ['loyalty', 'anxiously', 'lapel'], ['anxiously', 'lapel', 'loyalty'], 'સાચો ક્રમ: (1) anxiously (આતુરતાથી), (2) lapel (કોટનો કોલર ભાગ), (3) loyalty (વફાદારી).'],
  [26, 'Installing a solar microgrid is a grand event in the village and everyone gets {{0}}. The team maps the village house by house beneath the {{1}} mid-day sun, and Azaz installs the panel on a {{2}} brick-walled home.', ['sturdy', 'involved', 'scorching'], ['involved', 'scorching', 'sturdy'], 'સાચો ક્રમ: (1) involved (જોડાય છે), (2) scorching (ધગધગતો), (3) sturdy (મજબૂત).'],
  [27, 'The library opened its halls for women to get help in managing family conflicts and legal {{0}}. The secretary pointed out that through reading, women would realize their own strength and {{1}} a unity instead of letting rural reading rooms {{2}}.', ['disappear', 'disputes', 'forge'], ['disputes', 'forge', 'disappear'], 'સાચો ક્રમ: (1) disputes (વિવાદો), (2) forge (ઘડવું/બનાવવું), (3) disappear (અદ્રશ્ય થવું).'],
  [28, 'The salesman {{0}} the gait, grip, and movement of Ram Singh-070. Prem Chopra seemed {{1}} with the deal and nodded {{2}} as he signed the contract.', ['delightedly', 'demonstrated', 'satisfied'], ['demonstrated', 'satisfied', 'delightedly'], 'સાચો ક્રમ: (1) demonstrated (પ્રદર્શિત કર્યું), (2) satisfied (સંતુષ્ટ), (3) delightedly (આનંદપૂર્વક).'],
  [29, 'Computerized cameras capable of split-second recording clicked Ram Singh in the act. Prem Chopra {{0}} as soon as he saw two persons noting down the license number, and later he {{1}} all the {{2}} in the court.', ['allegations', 'fled', 'denied'], ['fled', 'denied', 'allegations'], 'સાચો ક્રમ: (1) fled (ભાગી ગયો), (2) denied (નકાર્યા), (3) allegations (આરોપો).'],
  [30, 'In the court, Counsel Goel {{0}} Ram Singh-070 to reveal the instructions. A clicking sound indicated the {{1}} of running tapes, and finally the robot {{2}} rather than disobey his master.', ['disintegrated', 'persuaded', 'hampering'], ['persuaded', 'hampering', 'disintegrated'], 'સાચો ક્રમ: (1) persuaded (સમજાવ્યો), (2) hampering (અવરોધ), (3) disintegrated (ટુકડા થઈ નષ્ટ થયો).'],
  [31, 'Arun Krishnamurthy did not feel any {{0}} in quitting his job at Google. He {{1}} all the options carefully before {{2}} into full-time environmental work.', ['venturing', 'hesitation', 'weighed'], ['hesitation', 'weighed', 'venturing'], 'સાચો ક્રમ: (1) hesitation (ખચકાટ), (2) weighed (વિચારણા કરી), (3) venturing (સાહસ કરવું).'],
  [32, 'People throw everything from a diaper to worn-out slippers into lakes. EFI uses this garbage for {{0}} with minimal {{1}} to the outside environment so that birds and frogs can live in peace without {{2}}.', ['disturbance', 'landfill', 'exposure'], ['landfill', 'exposure', 'disturbance'], 'સાચો ક્રમ: (1) landfill (જમીન ભરણ), (2) exposure (સંપર્ક), (3) disturbance (ખલેલ).'],
  [33, "Arun's NGO offers {{0}} to interested students. They give training to young wildlife photographers and scientific researchers and get them {{1}} involved so they can {{2}} their time for nature.", ['devote', 'fellowships', 'actively'], ['fellowships', 'actively', 'devote'], 'સાચો ક્રમ: (1) fellowships (ફેલોશિપ/શિષ્યવૃત્તિ), (2) actively (સક્રિય રીતે), (3) devote (સમર્પિત કરવું).'],
  [34, 'The angel went round the model of the mother and was {{0}}. He moved his finger across her cheek and noticed a {{1}} coming out of her eyes, which the Lord called a {{2}}.', ['miracle', 'impressed', 'tear'], ['impressed', 'tear', 'miracle'], 'સાચો ક્રમ: (1) impressed (પ્રભાવિત), (2) tear (આંસુ), (3) miracle (ચમત્કાર).'],
  [35, "The Lord explained that all parts of a mother should be {{0}} and {{1}}. She would manage a child's bath, play, study, and sleep without getting {{2}}.", ['irritated', 'movable', 'replaceable'], ['movable', 'replaceable', 'irritated'], 'સાચો ક્રમ: (1) movable (હલનચલન કરી શકે તેવા), (2) replaceable (બદલી શકાય તેવા), (3) irritated (ચીડાયા વગર).'],
  [36, 'In fireworks, colours are formed through luminescence and {{0}}. When the temperature is {{1}}, the glow of metallic substances can be {{2}} to emit the desired colour.', ['manipulated', 'incandescence', 'controlled'], ['incandescence', 'controlled', 'manipulated'], 'સાચો ક્રમ: (1) incandescence (તાપદીપ્તિ), (2) controlled (નિયંત્રિત), (3) manipulated (બદલી શકાય).'],
  [37, 'During the Second World War, imports of fireworks were stopped, and safety match producers in Sivakasi began {{0}} them. However, there are very few testing facilities for {{1}} and hardly any safety {{2}} in force.', ['measures', 'manufacturing', 'uniformity'], ['manufacturing', 'uniformity', 'measures'], 'સાચો ક્રમ: (1) manufacturing (ઉત્પાદન), (2) uniformity (એકરૂપતા), (3) measures (પગલાં).'],
  [38, 'Helen Keller learnt to speak through the movements of lips and {{0}} in the throat. When she {{1}} her first word, it gave her {{2}} delight.', ['boundless', 'vibration', 'uttered'], ['vibration', 'uttered', 'boundless'], 'સાચો ક્રમ: (1) vibration (કંપન), (2) uttered (ઉચ્ચાર્યો), (3) boundless (અપાર).'],
  [39, "At Radcliffe College, lectures were spelled into Helen's palms {{0}}. She knew there were many {{1}} in her way, but she was eager to {{2}} them all.", ['overcome', 'rapidly', 'challenges'], ['rapidly', 'challenges', 'overcome'], 'સાચો ક્રમ: (1) rapidly (ઝડપથી), (2) challenges (પડકારો), (3) overcome (પાર પાડવું).'],
  [40, "Helen's prime goal was to spread {{0}} regarding the neglected state of the blind and their {{1}} abilities. She raised funds to remove darkness and {{2}} from their lives.", ['miseries', 'awareness', 'innate'], ['awareness', 'innate', 'miseries'], 'સાચો ક્રમ: (1) awareness (જાગૃતિ), (2) innate (જન્મજાત), (3) miseries (દુઃખો).'],
  [41, "The Devs went to their chief adviser Brihaspati and {{0}} his help. They requested Kach to go to Shukracharya's hermitage and {{1}} him with all {{2}} to learn Sanjivani Vidya.", ['devotion', 'sought', 'serve'], ['sought', 'serve', 'devotion'], 'સાચો ક્રમ: (1) sought (માંગી), (2) serve (સેવા કરવી), (3) devotion (ભક્તિ).'],
  [42, 'When Kach refused to marry Devayani, she felt he had {{0}} her trust and {{1}} him that he would not be able to {{2}} what he had learnt.', ['practise', 'betrayed', 'cursed'], ['betrayed', 'cursed', 'practise'], 'સાચો ક્રમ: (1) betrayed (વિશ્વાસઘાત કર્યો), (2) cursed (શાપ આપ્યો), (3) practise (ઉપયોગ કરવો).'],
  [43, 'The horn-bill is a bird with a {{0}} beak. It {{1}} a hollow in a tall tree and {{2}} its female inside to protect the eggs from predators.', ['seals', 'prominent', 'selects'], ['prominent', 'selects', 'seals'], 'સાચો ક્રમ: (1) prominent (મોટી/વિશિષ્ટ), (2) selects (પસંદ કરે છે), (3) seals (બંધ કરી દે છે).'],
  [44, 'Good {{0}} habits and a healthy diet improve {{1}} power. Students should avoid {{2}} food during exam days to stay active.', ['junk', 'study', 'retention'], ['study', 'retention', 'junk'], 'સાચો ક્રમ: (1) study (અભ્યાસ), (2) retention (યાદશક્તિ), (3) junk (જંક ફૂડ).'],
  [45, 'Blandford had {{0}} to a woman whose name was inside the cover of a book. When they finally met, she {{1}} him to dinner to {{2}} their friendship.', ['celebrate', 'corresponded', 'invited'], ['corresponded', 'invited', 'celebrate'], 'સાચો ક્રમ: (1) corresponded (પત્રવ્યવહાર કર્યો), (2) invited (આમંત્રિત કર્યા), (3) celebrate (ઉજવણી કરવી).'],
];

const q42Questions: QuizQuestion[] = Q42_SPECS.map(([num, paragraph, wordBank, answers, exp, board]) => ({
  id: `eng_q42_${num}`,
  questionMode: 'tap_fill_bank',
  questionText: `${num}) ${paragraph}`,
  options: [],
  correctIndex: 0,
  wordBank: [...wordBank],
  blanks: answers.map((ans) => ({ options: [...wordBank], correctAnswer: ans })),
  explanation: exp,
  sourceLabel: board ? `Section C • Q. 42 (${board})` : 'Section C • Q. 42 (Textbook Practice)',
}));

export const englishVocabParagraphChapter: QuizChapter = {
  id: 'eng_q42',
  subjectId: 'english',
  chapterNumber: 'Section C • Q. 42',
  title: 'Complete the Paragraph (ખાલી જગ્યા ભરો)',
  subtitle: 'Tap the 3 bracketed words below to fill in the blanks (45 Questions)',
  questions: q42Questions,
  questionTypeLabel: 'Tap-to-Fill (3 શબ્દો)',
};
