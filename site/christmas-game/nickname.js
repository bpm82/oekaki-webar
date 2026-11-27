"use strict";

const prohibitedJapanesePhrases = [
  "死ね", "死んでしまえ", "しんでしまえ", "しねよ", "しねしね", "とっととしね",
  "殺す", "ころすぞ", "ころすよ", "ころしてやる",
  "殺してやる", "ぶっ殺", "ぶっころ", "人殺し", "ひとごろし", "殺人", "自殺", "じさつ", "首吊り",
  "きちがい", "基地外", "くろんぼ", "どじん", "土人", "くそやろう", "糞野郎", "くそったれ",
  "ばかやろう", "ふぁっく",

  // Sexual acts, explicit anatomy, and common slang.
  "性行為", "性こうい", "せい行為", "せいこうい", "性交", "接合行為", "交尾", "まぐわい",
  "せっくす", "ふぇら", "くんに", "おーらるせっくす", "あなる", "しっくすないん",
  "正常位", "騎乗位", "後背位", "対面座位", "口淫", "肛交", "乱交", "輪姦", "獣姦", "ぺってぃんぐ",
  "ぱいずり", "手こき", "てこき", "足こき", "あしこき",
  "指まん", "ゆびまん", "手まん", "てまん", "手淫", "自慰", "おなに", "しこしこ", "しこる", "ますたーべーしょん",
  "中出し", "なかだし", "外出し", "そとだし", "膣内", "ちつない", "射精", "精液", "せいえき",
  "勃起", "ぼっき", "絶頂", "おーがずむ", "性器", "陰茎", "いんけい", "陰部", "陰核",
  "陰唇", "睾丸", "こうがん", "膣", "肛門", "こうもん", "ぺにす", "ゔぁぎな", "ばぎな",
  "ちんこ", "ちんぽ", "まんこ", "まんげ", "おっぱい", "乳首", "ちくび", "こんどーむ", "でぃるど",
  "れいぷ", "強姦", "ごうかん", "ぽるの", "av女優", "av男優", "av動画", "売春", "買春", "ばいしゅん",

  // Excretion, bodily waste, and compounds used as vulgar nicknames.
  "うんこ", "うんちくん", "糞", "大便", "だいべん", "小便", "しょうべん", "しょんべん",
  "排泄", "排せつ", "はいせつ", "脱ふん", "だっぷん", "汚物", "おぶつ", "下痢", "便器", "便所",
  "しりべん", "おしっこ", "しっこ", "尿", "屁", "おなら", "鼻くそ", "はなくそ", "鼻水",
  "生ごみ", "なまごみ", "吐瀉", "吐しゃ", "嘔吐", "おうとぶつ", "げろまみれ", "げろまん",
  "くそまみれ", "くそがき", "くそくらえ"
];

const prohibitedJapaneseNames = new Set([
  "しね", "ころす", "くびつり", "きえろ", "消えろ", "くそ", "糞", "かす", "ばか", "馬鹿",
  "あほ", "阿呆", "きもい", "えろ", "えっち", "変態", "ちんちん", "びっち",
  "めくら", "つんぼ", "かたわ", "こうび", "ちつ", "ばいぶ", "しゃせい", "せいき", "げろ", "げり", "おうと", "痰"
]);

const prohibitedEnglishPhrases = [
  "fuck", "asshole", "bullshit", "shithead", "sonofabitch", "dickhead", "cocksucker", "nigger",
  "killyou", "killall", "murderyou", "hangyourself",
  "sexualintercourse", "oralsex", "analsex", "sexact", "sexvideo", "sextoy", "sexman", "sexking",
  "blowjob", "handjob", "footjob", "rimjob", "jerkoff", "jackoff", "cunnilingus", "fellatio", "masturbat", "ejaculat", "orgasm",
  "gangbang", "doggystyle", "missionaryposition", "cowgirlposition", "reversecowgirl", "sixtynine",
  "deepthroat", "threesome", "fornicat", "cumshot", "buttplug", "butthole",
  "genitalia", "testicles", "clitoris", "dildo", "pornograph", "pornstar",
  "feces", "faeces", "excrement", "excreta", "excretion", "defecat", "urinat", "poop", "diarrhea", "diarrhoea", "vomit",
  "booger", "pissing", "pisspot", "pissman", "peepee", "doodoo", "farting", "turdman", "shitface"
];

const prohibitedEnglishWords = new Set([
  "fck", "fuk", "fcuk", "shit", "shitty", "bitch", "bitches", "bastard", "dumbass", "jackass",
  "cunt", "faggot", "fag", "retard", "nigga", "kike", "spic", "whore", "slut", "pussy",
  "sex", "sexy", "porn", "porno", "penis", "vagina", "cum", "rape", "rapist",
  "kill", "killer", "murder", "suicide", "nazi", "nazis", "kys",
  "intercourse", "anal", "oral", "rimming", "pegging", "creampie", "condom", "prostitution",
  "genitals", "vulva", "labia", "anus", "ballsack", "scrotum", "erection", "semen", "boobs", "tits",
  "poo", "pee", "piss", "urine", "stool", "dung", "snot", "fart", "turd", "sewage",
  "crap", "dookie", "scat", "retch", "barf", "puke"
]);

const prohibitedRomajiPhrases = [
  "seikoui", "seikoi", "sekkusu", "maguwai", "ferachio", "kuniringusu", "kunniringusu", "shikkusunain",
  "tekoki", "ashikoki", "paizuri", "yubiman", "nakadashi", "sotodashi", "chitsunai",
  "seieki", "bokki", "inkei", "kougan", "koumon", "penisu", "vagina", "bagina", "oppai", "chikubi",
  "chinko", "chinpo", "manko", "onanii", "masutaabeshon", "poruno",
  "oshikko", "shonben", "shouben", "daiben", "funben", "haisetsu", "dappun", "obutsu",
  "hanakuso", "namagomi", "outobutsu", "geromamire", "geroman", "kusomamire", "kusoyarou", "kusogaki",
  "unkoman", "unkochan", "unchiman", "unchikun", "rankou"
].map(nicknameRomajiWord);

const prohibitedRomajiWords = new Set([
  "koubi", "fera", "kunni", "anaru", "teman", "shuin", "jii", "onani", "shasei", "chitsu", "chinchin",
  "gero", "geri", "unko", "unchi", "onara", "kuso", "shikko", "shoben", "benjo", "benki", "nyou", "rinkan", "juukan"
].map(nicknameRomajiWord));

const nicknameSubstitutions = { 0: "o", 1: "i", 3: "e", 4: "a", 5: "s", 7: "t", 8: "b", "@": "a", "$": "s", "!": "i" };

function nicknameLatinWord(word) {
  return word.replace(/[0134578@$!]/g, (character) => nicknameSubstitutions[character]);
}

function nicknameRomajiWord(word) {
  return word.replace(/sy/g, "sh").replace(/ty/g, "ch").replace(/zy/g, "j")
    .replace(/si/g, "shi").replace(/ti/g, "chi").replace(/tu/g, "tsu")
    .replace(/zi/g, "ji").replace(/(?<![sc])hu/g, "fu");
}

function hasProhibitedNickname(name) {
  const normalized = name.normalize("NFKC").toLowerCase().replace(/\p{Cf}/gu, "");

  // Fold width, script, and separators while keeping the original nickname for display.
  const japanese = normalized
    .replace(/[ァ-ヶ]/g, (letter) => String.fromCharCode(letter.charCodeAt(0) - 0x60))
    .replace(/[^\p{L}\p{N}]/gu, "");
  if (prohibitedJapaneseNames.has(japanese) || /うんち(?!く)/.test(japanese) ||
    prohibitedJapanesePhrases.some((word) => japanese.includes(word))) {
    return true;
  }

  const latin = normalized.normalize("NFD").replace(/([ou])\u0304/g, "$1u")
    .replace(/\p{M}/gu, "").replace(/œ/g, "oe").replace(/æ/g, "ae");
  const tokens = latin.match(/[a-z0-9@$!]+/g) ?? [];
  const joined = tokens.join("");
  const forms = new Set([...tokens, joined, joined.replace(/[@$!]/g, "")].flatMap((word) => [
    nicknameLatinWord(word),
    nicknameLatinWord(word.replace(/^\d+|\d+$/g, ""))
  ]));
  for (const form of forms) {
    if (prohibitedEnglishWords.has(form) || prohibitedEnglishPhrases.some((phrase) => form.includes(phrase))) {
      return true;
    }
    const romaji = nicknameRomajiWord(form);
    if (prohibitedRomajiWords.has(romaji) || prohibitedRomajiPhrases.some((phrase) => romaji.includes(phrase))) {
      return true;
    }
  }
  return false;
}
