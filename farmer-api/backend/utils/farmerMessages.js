const LANGUAGES = ['en', 'hi'];

const CATEGORIES = [
  { value: 'Pipeline leakage', label: { en: 'Pipeline leakage', hi: 'पाइपलाइन से रिसाव' } },
  { value: 'No water supply', label: { en: 'No water supply', hi: 'पानी की आपूर्ति नहीं' } },
  { value: 'Dirty water', label: { en: 'Dirty water', hi: 'गंदा पानी' } },
  { value: 'Low water pressure', label: { en: 'Low water pressure', hi: 'पानी का दबाव कम' } },
  { value: 'Damaged infrastructure', label: { en: 'Damaged infrastructure', hi: 'टूटा-फूटा ढाँचा' } },
  { value: 'Other', label: { en: 'Other', hi: 'अन्य' } }
];

const VILLAGE_STATUS = {
  good: {
    en: 'Water supply is normal.',
    hi: 'पानी की आपूर्ति सामान्य है।'
  },
  low: {
    en: 'Water level is low or a water source is under maintenance. Please use water carefully.',
    hi: 'पानी का स्तर कम है या कोई जल स्रोत मरम्मत में है। कृपया पानी सोच-समझकर इस्तेमाल करें।'
  },
  problem: {
    en: 'A problem has been reported with the water supply in this village.',
    hi: 'इस गाँव की पानी की आपूर्ति में समस्या दर्ज की गई है।'
  },
  unknown: {
    en: 'There are no water level readings for this village yet, so its water supply status is not known.',
    hi: 'इस गाँव के लिए अभी पानी के स्तर की कोई रीडिंग नहीं है, इसलिए पानी की आपूर्ति की स्थिति ज्ञात नहीं है।'
  }
};

const COMPLAINT_STATUS = {
  pending: {
    en: 'Your complaint has been received and is waiting for review.',
    hi: 'आपकी शिकायत दर्ज हो गई है और समीक्षा की प्रतीक्षा में है।'
  },
  inprogress: {
    en: 'Officials are working on your complaint.',
    hi: 'आपकी शिकायत पर काम चल रहा है।'
  },
  resolved: {
    en: 'Your complaint has been resolved.',
    hi: 'आपकी शिकायत का समाधान हो गया है।'
  },
  unknown: {
    en: 'Officials have updated the status of your complaint.',
    hi: 'अधिकारियों ने आपकी शिकायत की स्थिति अपडेट की है।'
  }
};

const COMPLAINT_RECEIVED = {
  en: 'Your complaint has been registered. Keep your complaint number and tracking code to check its status.',
  hi: 'आपकी शिकायत दर्ज कर ली गई है। स्थिति जानने के लिए अपना शिकायत नंबर और ट्रैकिंग कोड संभालकर रखें।'
};

const DIRECTORY = {
  villages: {
    en: 'Villages with a plain-language water supply status (optional ?q= name prefix, ?limit=)',
    hi: 'गाँवों की पानी की आपूर्ति की सरल भाषा में स्थिति (वैकल्पिक: ?q= नाम का आरंभ, ?limit=)'
  },
  village: {
    en: 'Water points, status and notices for one village',
    hi: 'एक गाँव के जल स्रोत, स्थिति और सूचनाएँ'
  },
  nearby: {
    en: 'Closest working water points to ?lat= and ?lng= (optional ?radiusKm=, ?type=, ?limit=)',
    hi: '?lat= और ?lng= के सबसे नज़दीकी चालू जल स्रोत (वैकल्पिक: ?radiusKm=, ?type=, ?limit=)'
  },
  register: {
    en: 'Register a complaint and receive a complaint number and tracking code (optional Idempotency-Key header)',
    hi: 'शिकायत दर्ज करें और शिकायत नंबर व ट्रैकिंग कोड पाएँ (वैकल्पिक Idempotency-Key हेडर)'
  },
  track: {
    en: 'Check the status of a complaint with its number and tracking code (X-Complaint-Token header)',
    hi: 'शिकायत नंबर और ट्रैकिंग कोड से शिकायत की स्थिति देखें (X-Complaint-Token हेडर)'
  }
};

const LEVEL_TEXT = {
  critical: { en: 'Critically low', hi: 'बहुत कम' },
  low: { en: 'Low', hi: 'कम' },
  medium: { en: 'Medium', hi: 'मध्यम' },
  good: { en: 'Good', hi: 'अच्छा' }
};

const TYPE_TEXT = {
  tank: { en: 'Water tank', hi: 'पानी की टंकी' },
  borewell: { en: 'Borewell', hi: 'बोरवेल' },
  pump: { en: 'Pump', hi: 'पंप' },
  pipeline: { en: 'Pipeline', hi: 'पाइपलाइन' }
};

const NOTICE_TEXT = {
  en: (name) => `A problem has been reported at ${name}.`,
  hi: (name) => `${name} पर समस्या दर्ज की गई है।`
};

const villageMessage = (status, lang) => VILLAGE_STATUS[status][lang];

const complaintMessage = (key, lang) => (COMPLAINT_STATUS[key] || COMPLAINT_STATUS.unknown)[lang];

const complaintReceived = (lang) => COMPLAINT_RECEIVED[lang];

const levelText = (band, lang) => LEVEL_TEXT[band][lang];

const typeText = (type, lang) => {
  const entry = TYPE_TEXT[String(type).trim().toLowerCase()];
  return entry ? entry[lang] : String(type);
};

const noticeText = (name, lang) => NOTICE_TEXT[lang](name);

const directoryText = (key, lang) => DIRECTORY[key][lang];

module.exports = {
  LANGUAGES,
  CATEGORIES,
  villageMessage,
  complaintMessage,
  complaintReceived,
  levelText,
  typeText,
  noticeText,
  directoryText
};
