extends RefCounted
## Every piece of text in the Quest version, in Arabic (first) and English.
## Arabic is written for Arabic readers, not translated word for word.

const T := {
	"ar": {
		"title": "طيف",
		"tab_howto": "الشرح", "tab_settings": "الإعدادات", "tab_lang": "اللغة", "tab_studio": "الاستوديو", "tab_about": "عن اللعبة",
		"resume": "متابعة",
		"howto": "[b]الفكرة[/b]\nعندك عدد محدود من الخطوات في كل دورة. لما تخلص، ترجع للبداية ومشيك يصير [b]طيفًا[/b] أزرق يعيد خطواتك بالضبط وأنت تمشي معه.\nالباب ينفتح بس وأحد واقف على دائرته: خلّ طيفك يمسك الباب وأنت تعبر للنجمة.\n[b]باب الساعة[/b] يبقى مفتوح ٣ خطوات بعد ما ينزل أحد عن دائرته. [b]الدائرة المخططة[/b] عكس الباقي: تقفل بابها لما أحد يقف عليها.\n\n[b]الأزرار[/b]\nالعصا اليمنى: امشِ خطوة · الزناد الأيمن على مربع: روح له\nA: انتظر · B: تراجع خطوة · X: تلميح · Y: ارجع دورة\nالزناد الأيسر: خلّص الدورة الحين وخلّ مشيك طيف\nالقبضة: حرّك الطاولة · العصا اليسرى: لفّ وكبّر · ☰: هذي القائمة",
		"sound": "الصوت", "volume": "مستوى الصوت", "life": "حياة المشهد (رياح، طيور، فراشات)", "card": "لوحة الأزرار خلف الطاولة",
		"recenter": "رجّع الطاولة قدامي", "zoom": "حجم الطاولة الأصلي", "restart": "ابدأ من المرحلة الأولى", "restart_sure": "متأكد؟ اضغط مرة ثانية",
		"on": "تشغيل", "off": "إيقاف",
		"lang_note": "اختر لغة اللعبة",
		"studio": "[b]عبودين قيمز — Aboden Games[/b]\n\nاستوديو ألعاب مستقل يصنع ألعابًا عربية بأفكار بسيطة وعمق يزيد مع اللعب، للنظارات والجوال والويب.\n\nالموقع: abodengames.com\nالبريد: aboden.games@gmail.com",
		"about": "[b]طيف[/b] · الإصدار %s\n\nلغز هادئ على طاولتك: كل محاولة تترك طيفًا يعيد خطواتك ويفتح لك الطريق. المراحل ما تنتهي، وكل وحدة تحتاج طيف.\n\n[b]شكر وتقدير[/b]\nمحرك Godot — رخصة MIT\nإضافة Godot OpenXR Vendors\nإضافة Godot Meta Toolkit\nخط Baloo Bhaijaan 2 — رخصة SIL OFL",
		"card_text": "العصا اليمنى: امشِ خطوة\nالزناد الأيمن على مربع: روح له\nA: انتظر      B: تراجع خطوة\nX: تلميح      Y: ارجع دورة\nالزناد الأيسر: خلّص الدورة الحين وخلّ مشيك طيف\nالقبضة: حرّك الطاولة      العصا اليسرى: لفّ وكبّر\n☰ القائمة · اضغط العصا اليسرى لإخفاء هذي اللوحة",
	},
	"en": {
		"title": "Tayf",
		"tab_howto": "How to play", "tab_settings": "Settings", "tab_lang": "Language", "tab_studio": "Studio", "tab_about": "About",
		"resume": "Resume",
		"howto": "[b]The idea[/b]\nEach loop gives you a limited number of steps. When they run out you go back to the start, and your walk becomes a blue [b]ghost[/b] that repeats your steps exactly while you walk beside it.\nA door opens only while someone stands on its plate: let your ghost hold the door while you cross to the star.\nA [b]clock door[/b] stays open for 3 steps after its plate is left. A [b]striped plate[/b] works the other way: it closes its door while someone stands on it.\n\n[b]Controls[/b]\nRight stick: step · Right trigger on a cell: walk there\nA: wait · B: undo a step · X: hint · Y: back one loop\nLeft trigger: end the loop now and turn your walk into a ghost\nGrip: move the table · Left stick: turn and resize · ☰: this menu",
		"sound": "Sound", "volume": "Volume", "life": "Living scene (wind, birds, butterflies)", "card": "Controls card behind the table",
		"recenter": "Bring the table in front of me", "zoom": "Reset table size", "restart": "Start again from room 1", "restart_sure": "Sure? Press again",
		"on": "On", "off": "Off",
		"lang_note": "Choose the game language",
		"studio": "[b]Aboden Games — عبودين قيمز[/b]\n\nAn independent studio making Arabic games with simple ideas that grow deeper as you play, for headsets, phones and the web.\n\nWebsite: abodengames.com\nEmail: aboden.games@gmail.com",
		"about": "[b]Tayf[/b] · version %s\n\nA calm puzzle on your table: every attempt leaves a ghost that repeats your steps and opens the way. Rooms never run out, and every one needs a ghost.\n\n[b]Credits[/b]\nGodot Engine — MIT licence\nGodot OpenXR Vendors plugin\nGodot Meta Toolkit plugin\nBaloo Bhaijaan 2 font — SIL OFL",
		"card_text": "Right stick: step\nRight trigger on a cell: walk there\nA: wait      B: undo a step\nX: hint      Y: back one loop\nLeft trigger: end the loop now (your walk becomes a ghost)\nGrip: move the table      Left stick: turn and resize\n☰ menu · click the left stick to hide this card",
	},
}


static func t(lang: String, key: String) -> String:
	return T.get(lang, T.ar).get(key, T.ar.get(key, key))
