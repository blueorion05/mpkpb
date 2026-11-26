export type GengContext =
  | 'new-wallet'
  | 'tight-wallet'
  | 'healthy-wallet'
  | 'negative-wallet'
  | 'saving'
  | 'ledger'
  | 'budget'
  | 'planning'
  | 'forecast'
  | 'generic'

export interface GengPreferences {
  humorEnabled: boolean
  profanityEnabled: boolean
}

export interface GengPunchline {
  context: GengContext
  text: string
  mildProfanity: boolean
}

export const GENG_EXPRESSION = '(ง •̀_•́)ง'

const punchlines: readonly GengPunchline[] = [
  { context: 'healthy-wallet', text: 'Sheesh, may datung pa! Chill lang sa checkout, geng.', mildProfanity: false },
  { context: 'tight-wallet', text: 'Tagilid na, gar. Ekis muna sa budol.', mildProfanity: false },
  { context: 'budget', text: 'Omsim, solid ang may plano bago mag-checkout.', mildProfanity: false },
  { context: 'forecast', text: 'Ayaw natin ng financial jumpscare, bossing. Silip sa due dates.', mildProfanity: false },
  { context: 'saving', text: 'Solid, may naipon ang youngstunna.', mildProfanity: false },
  { context: 'ledger', text: 'Putek, dumaan lang ba ’yung sahod? Silipin natin ang records.', mildProfanity: true },
  { context: 'generic', text: 'Ey, what’s good, geng? Silip muna sa mga naka-schedule.', mildProfanity: false },
  { context: 'generic', text: 'Deserve mo ba talaga o nabudol ka lang?', mildProfanity: false },
  { context: 'healthy-wallet', text: 'May pera pa, youngstunna. Chill lang sa checkout.', mildProfanity: false },
  { context: 'tight-wallet', text: 'Youngstunna, lowbat na wallet mo.', mildProfanity: false },
  { context: 'tight-wallet', text: 'Sardinas muna, geng. Bawi next payday.', mildProfanity: false },
  { context: 'tight-wallet', text: 'Putek, saan napunta ’yung pera?', mildProfanity: true },
  { context: 'ledger', text: 'Dito natin malalaman kung ilan talaga ’yung “isang kape lang.”', mildProfanity: false },
  { context: 'budget', text: 'Budget mo ’yan, geng. Hindi unli rice.', mildProfanity: false },
  { context: 'forecast', text: 'Baka may plot twist bukas. Silipin muna ’yung due dates.', mildProfanity: false },
  { context: 'planning', text: 'May due date na? I-record na bago matabunan ng group chat.', mildProfanity: false },
  { context: 'ledger', text: 'May resibo? I-log bago malabhan kasama ng pantalon.', mildProfanity: false },
  { context: 'budget', text: 'May sariling category ang kape. Aba, may department na siya.', mildProfanity: false },
  { context: 'planning', text: 'Nauna ang reminder sa singil. May character development.', mildProfanity: false },
  { context: 'forecast', text: 'Silipin ang susunod na linggo bago mag-book ng lakad na biglaan.', mildProfanity: false },
  { context: 'saving', text: 'May ambag na naman sa future mo. Walang attendance check, pero counted.', mildProfanity: false },
  { context: 'new-wallet', text: 'Bagong wallet, bagong kabanata. Sana walang plot twist sa delivery fee.', mildProfanity: false },
  { context: 'new-wallet', text: 'Welcome sa pera HQ. Walang dress code, pero may budget meeting.', mildProfanity: false },
  { context: 'new-wallet', text: 'Isang wallet pa lang, pero organized na kaysa sa group chat.', mildProfanity: false },
  { context: 'new-wallet', text: 'Nagsimula na ang pera era mo. Main character, pero may spreadsheet.', mildProfanity: false },
  { context: 'new-wallet', text: 'May bagong bahay na ang pera. Sana marunong siyang magligpit.', mildProfanity: false },
  { context: 'new-wallet', text: 'Wallet unlocked. Next achievement: alalahanin kung saan napunta ang sukli.', mildProfanity: false },
  { context: 'new-wallet', text: 'Welcome, wallet. Dito muna tayo magkunwaring hindi mahal ang kape.', mildProfanity: false },
  { context: 'new-wallet', text: 'Bagong wallet, fresh start. Walang nanghuhusga rito, pati resibo.', mildProfanity: false },
  { context: 'new-wallet', text: 'Nasa isang lugar na ang pera mo. Ikaw na lang ang hinahanap ng budget.', mildProfanity: false },
  { context: 'new-wallet', text: 'Ayos, may wallet na. Hindi na kailangan ng treasure map para hanapin ang cash.', mildProfanity: false },

  { context: 'tight-wallet', text: 'Konting ingat muna, geng. Yung budget mo naka-tip-toe na.', mildProfanity: false },
  { context: 'tight-wallet', text: 'Tight ang pera, hindi ang pangarap. Dahan-dahan lang sa checkout.', mildProfanity: false },
  { context: 'tight-wallet', text: 'Bago mag-add to cart, tanungin muna kung need o bored lang.', mildProfanity: false },
  { context: 'tight-wallet', text: 'Maliit ang wiggle room. Pati piso, kailangan mag-file ng leave.', mildProfanity: false },
  { context: 'tight-wallet', text: 'Budget mode muna tayo. Ang sale, babalik; ang pera, sana rin.', mildProfanity: false },
  { context: 'tight-wallet', text: 'Hindi bawal gumastos, pero pa-check muna ng balance bago mag-checkout.', mildProfanity: false },
  { context: 'tight-wallet', text: 'Medyo dikit ang pera. I-delay muna natin ang “deserve ko ’to” speech.', mildProfanity: false },
  { context: 'tight-wallet', text: 'Kapit sa budget, geng. Hindi lahat ng free shipping ay free talaga.', mildProfanity: false },
  { context: 'tight-wallet', text: 'May pera pa, pero ayaw na niyang sumali sa biglaang lakad.', mildProfanity: false },
  { context: 'tight-wallet', text: 'Konting preno muna, shuta ang bilis ng mga gastos minsan.', mildProfanity: true },

  { context: 'healthy-wallet', text: 'May breathing room ang wallet. Huwag lang bigyan ng shopping cart.', mildProfanity: false },
  { context: 'healthy-wallet', text: 'Mukhang okay ang balance. Confident tayo, pero hindi delulu.', mildProfanity: false },
  { context: 'healthy-wallet', text: 'Stable ang wallet mo. Sana all may emotional support savings.', mildProfanity: false },
  { context: 'healthy-wallet', text: 'May space pa ang budget. Bigyan pa rin natin ng respeto ang bawat piso.', mildProfanity: false },
  { context: 'healthy-wallet', text: 'Green flag ang balance ngayon. I-screenshot? Joke, nandito na siya.', mildProfanity: false },
  { context: 'healthy-wallet', text: 'Mukhang chill ang pera. Bawal lang siyang i-challenge sa budol.', mildProfanity: false },
  { context: 'healthy-wallet', text: 'Maayos ang takbo. Parang commute na walang traffic—savor the moment.', mildProfanity: false },
  { context: 'healthy-wallet', text: 'Your wallet is giving responsible adult. Medyo nakakagulat, pero slay.', mildProfanity: false },
  { context: 'healthy-wallet', text: 'Okay ang pera mo. Huwag lang mag-open ng shopping app “for research.”', mildProfanity: true },
  { context: 'healthy-wallet', text: 'Ayos ang balance, gagi. Parang may plot armor ang wallet today.', mildProfanity: true },

  { context: 'negative-wallet', text: 'May projected na kulang. Tingnan natin ang dates bago mag-panic, geng.', mildProfanity: false },
  { context: 'negative-wallet', text: 'Heads-up: may wallet na puwedeng sumadsad. Hindi biro ang timing ng bayarin.', mildProfanity: false },
  { context: 'negative-wallet', text: 'Medyo alanganin ang projection. Unahin ang due dates, saka ang luho.', mildProfanity: false },
  { context: 'negative-wallet', text: 'May dip sa forecast. Check natin kung kailan papasok ang susunod na pera.', mildProfanity: false },
  { context: 'negative-wallet', text: 'Hindi ito final na balance, pero kailangan ng plano bago ang due date.', mildProfanity: false },
  { context: 'negative-wallet', text: 'May shortage sa projection. Wallet, huwag kang mag-drama—gawa tayo ng game plan.', mildProfanity: false },
  { context: 'negative-wallet', text: 'May pera na naka-schedule, pero hindi pa actual. Ingat sa pagbilang nang maaga.', mildProfanity: false },
  { context: 'negative-wallet', text: 'May risk na kapusin. I-check ang bills at huwag umasa sa “baka may dumating.”', mildProfanity: false },
  { context: 'negative-wallet', text: 'May red flag sa cash flow. Hindi ito joke, kaya unahin natin ang plano.', mildProfanity: false },
  { context: 'negative-wallet', text: 'Ay, may kulang sa projection. Peste ang timing—silipin natin ang due dates.', mildProfanity: true },

  { context: 'saving', text: 'Bawat ipon, parang maliit na ambag sa future mong hindi kinakabahan.', mildProfanity: false },
  { context: 'saving', text: 'Savings goal mo, one piso at a time. Hindi kailangan ng montage, pero puwede.', mildProfanity: false },
  { context: 'saving', text: 'Ang ipon parang halaman: dilig-dilig, tapos huwag ubusin sa sale.', mildProfanity: false },
  { context: 'saving', text: 'Future you says salamat. Present you says puwede bang iced coffee muna?', mildProfanity: false },
  { context: 'saving', text: 'Consistency ang tunay na hack. Walang magic, pero may auto-discipline.', mildProfanity: false },
  { context: 'saving', text: 'Nag-iipon ka para sa options. Hindi lang para may pang-checkout.', mildProfanity: false },
  { context: 'saving', text: 'Ipon ngayon, konting peace of mind later. Hindi bad deal.', mildProfanity: false },
  { context: 'saving', text: 'Small deposits, big “buti na lang” energy.', mildProfanity: false },
  { context: 'saving', text: 'Ipon muna bago budol. Oo, pati “limited time” puwedeng maghintay.', mildProfanity: false },
  { context: 'saving', text: 'Hindi instant ang savings, putek. Pero instant din naman ang gastos kung pabaya.', mildProfanity: true },

  { context: 'ledger', text: 'I-log ang gastos habang sariwa pa. Hindi reliable ang “parang mga ₱200 lang.”', mildProfanity: false },
  { context: 'ledger', text: 'Bawat transaction may kuwento. Yung iba, “deserve ko ’to” ang plot.', mildProfanity: false },
  { context: 'ledger', text: 'Mas malinaw ang pera kapag hindi umaasa sa memoryang pagod na.', mildProfanity: false },
  { context: 'ledger', text: 'I-record ang fee rin. Kahit maliit, marunong magparami ang singil.', mildProfanity: false },
  { context: 'ledger', text: 'Tama ang transfer, fee lang ang expense. Hindi multo ang bawas sa wallet.', mildProfanity: false },
  { context: 'ledger', text: 'Resibo today, less “saan napunta?” tomorrow.', mildProfanity: false },
  { context: 'ledger', text: 'Ledger check: receipts don’t lie, pero minsan nakakagulat sila.', mildProfanity: false },
  { context: 'ledger', text: 'Kung may transaction, ilagay na. Baka bukas iba na ang alibi.', mildProfanity: false },
  { context: 'ledger', text: 'Huwag i-ghost ang gastos, geng. Lalabas din ’yan sa balance, gagi.', mildProfanity: true },
  { context: 'ledger', text: 'I-log ang fee bago sabihin na “konti lang ’yon.” Putek, centavo rin ’yon.', mildProfanity: true },

  { context: 'budget', text: 'Budget limit is a guide, hindi dare. Huwag natin siyang i-speedrun.', mildProfanity: false },
  { context: 'budget', text: 'Nasa budget ka pa. May natitira pang room para sa totoong kailangan.', mildProfanity: false },
  { context: 'budget', text: 'Budget check muna bago ang “add to cart” na may kasamang dasal.', mildProfanity: false },
  { context: 'budget', text: 'Ang category limit parang traffic light: yellow means think muna.', mildProfanity: false },
  { context: 'budget', text: 'Kahit may budget, hindi kailangang ubusin. Hindi siya assignment.', mildProfanity: false },
  { context: 'budget', text: 'Gumagana ang budget kapag binabago ang plano, hindi ang math.', mildProfanity: false },
  { context: 'budget', text: 'Track the category, not just the total. May mga gastos na nagtatago sa group project.', mildProfanity: false },
  { context: 'budget', text: 'Planong gumastos, hindi planong magulat. Check the category first.', mildProfanity: false },
  { context: 'budget', text: 'Huwag gawing challenge ang limit, shuta. Hindi ito game show.', mildProfanity: true },
  { context: 'budget', text: 'Budget mo ’yan, hindi suggestion ng checkout page. Konting preno, gagi.', mildProfanity: true },

  { context: 'planning', text: 'Expected income is not yet spendable. Huwag munang gastusin ang plot twist.', mildProfanity: false },
  { context: 'planning', text: 'May schedule na ang income. Hintayin munang maging actual bago mag-celebrate.', mildProfanity: false },
  { context: 'planning', text: 'Partial receipt? Okay lang. Hindi kailangang magkunwaring buo na.', mildProfanity: false },
  { context: 'planning', text: 'Due date, amount, wallet. Tatlong detalye na mas maaasahan kaysa “next week yata.”', mildProfanity: false },
  { context: 'planning', text: 'Planned bill pa lang ito. Hindi pa kaltas, pero magandang paghandaan.', mildProfanity: false },
  { context: 'planning', text: 'Ang recurring schedule, paulit-ulit. Parang subscription na nakalimutang i-cancel.', mildProfanity: false },
  { context: 'planning', text: 'Settle in parts kung kailangan. Small steps pa rin ang progress.', mildProfanity: false },
  { context: 'planning', text: 'Nasa calendar na ang due date. Isang less na surprise sa future mo.', mildProfanity: false },
  { context: 'planning', text: 'Expected pa lang ang pera, bes. Huwag muna siyang ipambili ng imaginary shoes.', mildProfanity: false },
  { context: 'planning', text: 'May due date na, putek. Mas okay nang makita ngayon kaysa magulat sa huli.', mildProfanity: true },

  { context: 'forecast', text: 'Forecast ito, hindi fortune teller. Pero mas okay nang may heads-up.', mildProfanity: false },
  { context: 'forecast', text: 'Tinitingnan natin ang bawat araw, hindi lang ang ending credits.', mildProfanity: false },
  { context: 'forecast', text: 'Positive ang ending pero may dip sa gitna? Ayun ang plot na dapat bantayan.', mildProfanity: false },
  { context: 'forecast', text: 'Same-day bill muna bago income sa check. Hindi puwedeng mag-time travel ang pera.', mildProfanity: false },
  { context: 'forecast', text: 'Protected funds stay protected. Hindi sila extra cash dahil lang nasa screen.', mildProfanity: false },
  { context: 'forecast', text: 'Try the what-if bago bumili. Mas mura ang simulation kaysa pagsisisi.', mildProfanity: false },
  { context: 'forecast', text: 'May conservative view para hindi puro “sana all” ang assumptions.', mildProfanity: false },
  { context: 'forecast', text: 'Safe-to-spend is a ceiling, not a dare. Dahan-dahan sa swipe.', mildProfanity: false },
  { context: 'forecast', text: 'Huwag magpa-hype sa final balance; silipin pati shortage sa gitna, gagi.', mildProfanity: true },
  { context: 'forecast', text: 'Forecast lang ’to, hindi prophecy. Pero putek, mas okay nang handa.', mildProfanity: true },

  { context: 'generic', text: 'Pera update: ikaw pa rin ang boss, pero magandang basahin ang memo.', mildProfanity: false },
  { context: 'generic', text: 'Kumusta ang wallet, at kumusta ang “deserve ko ’to”?', mildProfanity: false },
  { context: 'generic', text: 'Financial wellness, pero walang inspirational stock photo.', mildProfanity: false },
  { context: 'generic', text: 'Ang goal: malinaw na pera, mas kaunting “hala, saan napunta?”', mildProfanity: false },
  { context: 'generic', text: 'Walang perfect budget. Meron lang budget na ina-adjust imbes na iniiwasan.', mildProfanity: false },
  { context: 'generic', text: 'Small money moves count. Hindi kailangan ng dramatic background music.', mildProfanity: false },
  { context: 'generic', text: 'Kahit simpleng check-in, panalo na laban sa financial amnesia.', mildProfanity: false },
  { context: 'generic', text: 'Pera mo, rules mo. Basta alam mo kung nasaan sila.', mildProfanity: false },
  { context: 'generic', text: 'Walang judgment dito. Ang gastos lang ang pinapa-review natin, gagi.', mildProfanity: true },
  { context: 'generic', text: 'Financial check-in lang, hindi intervention. Unless kailangan, charot.', mildProfanity: false },
]

export const GENG_PUNCHLINES = punchlines

const neutralMessages: Record<GengContext, string> = {
  'new-wallet': 'Add a wallet to see your money in one place.',
  'tight-wallet': 'Review upcoming expenses before making a new purchase.',
  'healthy-wallet': 'Your current spendable balance is available for review.',
  'negative-wallet': 'A projected balance may fall below zero. Review the financial warning and dates.',
  saving: 'Small, consistent savings can support your future plans.',
  ledger: 'Keep transactions recorded to maintain a clear financial picture.',
  budget: 'Review category limits before recording additional spending.',
  planning: 'Check scheduled income and obligations against their due dates.',
  forecast: 'Review the full projection, including intermediate daily balances.',
  generic: 'Your money details are stored locally on this device.',
}

function hash(value: string): number {
  let result = 0
  for (let index = 0; index < value.length; index += 1) {
    result = (result * 31 + value.charCodeAt(index)) >>> 0
  }
  return result
}

function localDateKey(): string {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function getGengMessage(
  context: GengContext,
  preferences: GengPreferences,
  rotationKey = localDateKey(),
): string {
  if (!preferences.humorEnabled) return neutralMessages[context]
  const options = punchlines.filter((line) =>
    line.context === context && (preferences.profanityEnabled || !line.mildProfanity),
  )
  if (options.length === 0) return neutralMessages[context]
  return options[hash(`${context}:${rotationKey}`) % options.length].text
}
