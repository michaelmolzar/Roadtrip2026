import React, { useState, useEffect } from 'react';
import { 
  Calendar, MapPin, Car, Info, Waves, Sparkles, Euro, Tent, Navigation,
  Clock, CheckCircle2, Circle, Briefcase, ChevronRight, ChevronLeft, 
  Map as MapIcon, Home, Plus, User, Trash2, Filter, Camera, Utensils, 
  Wind, Bed, Hotel, CheckCircle, Plane, Settings, Save, Edit2, 
  ArrowRight, Wand2, Loader2, Copy, LayoutDashboard, Percent, 
  ChevronDown, ChevronUp, Search, Anchor, BookOpen, LogOut, Image as ImageIcon,
  CloudRain, Cloud, CloudLightning, Snowflake, Sun
} from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import { auth, db } from './firebase';
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email || undefined,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId || undefined,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Initialize Gemini safely
let ai: GoogleGenAI | null = null;
try {
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey && apiKey !== 'undefined') {
    ai = new GoogleGenAI({ apiKey });
  } else {
    console.warn("GEMINI_API_KEY is missing. AI features will be disabled.");
  }
} catch (e) {
  console.error("Failed to initialize Gemini API:", e);
}

const familyMembers = ['Papa', 'Mama', 'Melissa', 'Felix'];
const defaultCategories = ["Allgemein", "Technik", "Kleidung", "Dokumente", "Hygiene", "Action-Gear"];

const defaultAccommodations = [
  { id: 1, name: "Roissy / Plailly", nights: 1, days: "Tag 1", type: "Freizeitpark-Hotel", highlights: "Astérix, Disney Adventure World", note: "Startpunkt am CDG.", color: "bg-[#00162B]" },
  { id: 2, name: "Étretat / Fécamp", nights: 3, days: "Tag 2 – 4", type: "Gîte Alabasterküste", highlights: "Klippen, Rouen, Honfleur", note: "Obere Normandie.", color: "bg-[#DB0A40]" },
  { id: 3, name: "Bayeux", nights: 3, days: "Tag 5 – 7", type: "Chambres d’hôtes", highlights: "D-Day, Mont-Saint-Michel", note: "Historisches Zentrum.", color: "bg-[#00162B]" },
  { id: 4, name: "Saint-Malo / Dinard", nights: 3, days: "Tag 8 – 10", type: "Korsaren-Haus", highlights: "Smaragdküste, Dinan, Cancale", note: "Bretagne Start.", color: "bg-[#DB0A40]" },
  { id: 5, name: "Perros-Guirec", nights: 2, days: "Tag 11 – 12", type: "Ferienhaus Granitküste", highlights: "Rosa Felsen, Île de Bréhat", note: "Bizarre Natur.", color: "bg-[#00162B]" },
  { id: 6, name: "Concarneau / Bénodet", nights: 2, days: "Tag 13 – 14", type: "Südbretagne Apartment", highlights: "Îles de Glénan, Ville Close", note: "Südsee-Feeling.", color: "bg-[#DB0A40]" },
  { id: 7, name: "Nantes Zentrum", nights: 1, days: "Tag 15", type: "City Hotel", highlights: "Machines de l'Île, Schloss", note: "Finale in Nantes.", color: "bg-[#00162B]" }
];

const defaultFlights = [
  { id: 'outbound', type: 'Hinflug', date: 'Sommer 2026', from: 'Wien (VIE)', to: 'Paris (CDG)', time: '07:10 - 09:15', flightNo: 'OS 451', airline: 'Austrian Airlines', terminal: 'T3' },
  { id: 'return', type: 'Rückflug', date: 'Sommer 2026', from: 'Nantes (NTE)', to: 'Wien (VIE)', time: '18:45 - 20:50', flightNo: 'V7 2451', airline: 'Volotea / Transavia', terminal: 'T1' }
];

const getDefaultPacking = () => {
  const initial: Record<string, any[]> = {};
  const baseItems = [
    { id: 1, name: "Reisepass", category: "Dokumente", checked: false },
    { id: 2, name: "Regenjacke", category: "Kleidung", checked: false },
    { id: 3, name: "Smartphone", category: "Technik", checked: false },
    { id: 4, name: "Ladekabel", category: "Technik", checked: false },
    { id: 5, name: "Badesachen", category: "Action-Gear", checked: false },
    { id: 6, name: "Wanderschuhe", category: "Kleidung", checked: false },
    { id: 7, name: "Kreditkarte", category: "Dokumente", checked: false }
  ];
  familyMembers.forEach(member => { 
    initial[member] = baseItems.map(item => ({ ...item, id: Math.random() })); 
  });
  return initial;
};

const itinerary = [
  { day: 1, title: "Ankunft & Freizeitpark-Action", location: "Roissy / Plailly", accommodationId: 1, travelTime: "45 Min.", 
    details: [
      { type: "✈️", text: "Vormittag: Landung & Mietwagen", info: "Ankunft CDG am Morgen. Mietwagen-Übernahme. Wichtig: Einen Kombi (Estate) verlangen, damit das Gepäck unter die Laderaumabdeckung passt. SUV meiden wegen 1,90m Parkhauslimits in Frankreich!" },
      { type: "🎢", text: "Nachmittag: Parc Astérix", info: "🔬 Traveloptimizer: Direkt in den Park. Die absoluten Highlights für Teenager: 'Toutatis' (schnellste Bahn Frankreichs) und 'Osiris' (Inverted Coaster). Die neue Ägypten-Zone ist thematisch unfassbar gut gemacht." },
      { type: "🏰", text: "Alternative: Disney Adventure World", info: "Wer Disney bevorzugt: Fokus auf die Studios. 🔬 Traveloptimizer: Vorab die Disneyland App laden und virtuelle Warteschlangen (Standby Pass) für Top-Attraktionen wie die Frozen-Welt buchen." },
      { type: "🛏️", text: "Abend: Check-in Hotel", info: "Abendessen im oder in der Nähe des Parks. Check-in im Base-Camp 1 (Roissy/Plailly). Früh schlafen für den ersten Fahrtag." }
    ], description: "Direkter Start ins Adrenalin-Abenteuer nach der Landung in Paris.", researchTips: ["Astérix App für Wartezeiten laden", "Gepäck niemals sichtbar im Auto lassen!", "Maut-Tag (Bip&Go) prüfen für schnelle Autobahnfahrt"] },
  
  { day: 2, title: "Historie an der Seine", location: "Vernon & Rouen", accommodationId: 2, travelTime: "3 Std.", 
    details: [
      { type: "🚗", text: "Vormittag: Fahrt in die Normandie", info: "Wir verlassen den Großraum Paris in Richtung Nordwesten. Ziel ist das Tal der Seine." },
      { type: "🏛", text: "Mittag: Fotostopp Vernon", info: "Halt in Vernon an der Seine. Die 'Vieux-Moulin' (Alte Mühle) klebt förmlich auf den alten Brückenpfeilern über dem Wasser. Ein perfekter Instagram-Spot für die Kids. Picknick-Möglichkeit am Fluss." },
      { type: "⛪", text: "Nachmittag: Rouen Altstadt", info: "🔬 Traveloptimizer: Erkundung von Rouen. Pflicht: Die höchste Kathedrale Frankreichs, der unheimliche historische Pestfriedhof 'Aître Saint-Maclou' (mit Holzschädeln verziert) und die Rue del Gros-Horloge (Astronomische Uhr)." },
      { type: "☕", text: "Abend: Social Perk Café", info: "🔬 Traveloptimizer: Für die Teenager: Das 'Social Perk' besuchen – eine liebevolle, originalgetreue Nachbildung des Central Perk Cafés aus der Serie 'Friends'. Danach Check-in an der Alabasterküste." }
    ], description: "Verwunschene Mühlen und düster-schöne Mittelalter-Gassen.", researchTips: ["Coddy App für digitale Stadtrallye in Rouen nutzen", "Baguette und Käse für Picknick besorgen"] },

  { day: 3, title: "Klippen & Lupin", location: "Étretat", accommodationId: 2, travelTime: "Lokal", 
    details: [
      { type: "🥾", text: "Vormittag: Klippenwanderung", info: "🔬 Traveloptimizer: Wanderung auf der 'Falaise d’Aval'. Der Blick auf die 'Nadel' (Aiguille) ist das Postkartenmotiv schlechthin. Feste Schuhe anziehen, es geht steil bergauf!" },
      { type: "🌊", text: "Mittag: Der geheime Felsentunnel", info: "🔬 Traveloptimizer: Nur bei absoluter Ebbe! Vom Strand Étretat kann man durch einen natürlichen Tunnel im Felsen ('Trou à l'homme') auf die andere Seite zum einsamen Strand gehen. Tidenkalender beachten!" },
      { type: "🔍", text: "Nachmittag: Arsène Lupin", info: "Der berühmte Meisterdieb Lupin ist hier allgegenwärtig. Besuch des 'Clos Lupin' (Haus des Autors). 🔬 Traveloptimizer: Für Action sorgt das 'Panda Motion' Escape Game direkt im Ort." },
      { type: "🌅", text: "Abend: Chapelle Notre-Dame", info: "Sonnenuntergang an der kleinen Kapelle auf der Nordklippe (Falaise d'Amont). Von hier hat man den besten Blick über das Dorf und die gegenüberliegenden Felsenborgen." }
    ], description: "Die dramatischste und fotogenste Küste der gesamten Normandie.", researchTips: ["Maree.info für die Gezeiten (Tunnel!) prüfen", "Parkplätze in Étretat sind knapp, früh dran sein", "Windjacke einpacken"] },

  { day: 4, title: "Malerische Häfen & Glamour", location: "Honfleur & Deauville", accommodationId: 2, travelTime: "1,5 Std.", 
    details: [
      { type: "🌉", text: "Vormittag: Pont de Normandie", info: "Fahrt über die spektakuläre Schrägseilbrücke 'Pont de Normandie' über die Seine-Mündung. Kostet Maut, aber die Architektur ist atemberaubend." },
      { type: "🎨", text: "Mittag: Vieux Bassin Honfleur", info: "🔬 Traveloptimizer: Spaziergang um das alte Hafenbecken. Die unglaublich schmalen, schiefergedeckten Häuser spiegeln sich im Wasser. Unbedingt die Holzkirche Sainte-Catherine ansehen (sieht innen aus wie ein umgedrehtes Wikingerschiff)." },
      { type: "🦪", text: "Nachmittag: Fischmarkt Trouville", info: "🔬 Traveloptimizer: Rüber nach Trouville. Auf dem historischen Fischmarkt kann man frische Meeresfrüchte und Austern direkt am Stand extrem günstig kaufen und mit einem Schuss Zitrone snacken." },
      { type: "🏖", text: "Abend: Glamour in Deauville", info: "Flanieren über 'Les Planches', die berühmte Holzplanken-Promenade von Deauville, gesäumt von den Strandkabinen mit Namen amerikanischer Filmstars. Luxus-Vibes pur." }
    ], description: "Der schicke Kontrast zwischen urigem Fischerdorf und Jetset-Promenade.", researchTips: ["Kamera-Akku laden für Honfleur", "In Honfleur Cidre & Calvados als Souvenir kaufen"] },

  { day: 5, title: "D-Day History", location: "Omaha Beach", accommodationId: 3, travelTime: "1,75 Std.", 
    details: [
      { type: "✈️", text: "Vormittag: D-Day 4D Simulator", info: "🔬 Traveloptimizer: Start im 'D-Day Experience' in Saint-Côme-du-Mont. Das Highlight ist der Flugsimulator in originaler C-47 Maschine. Macht Geschichte für Teenager greifbar und extrem spannend." },
      { type: "🏛", text: "Mittag: Pointe du Hoc", info: "Besuch der Steilklippen, die von US-Rangers erklommen wurden. Das gesamte Areal ist noch immer eine Kraterlandschaft von den Bombardements. Man kann in alte deutsche Bunker klettern." },
      { type: "⚔️", text: "Nachmittag: Omaha Beach & Friedhof", info: "Besuch des blutigen Landungsstrandes. Danach hinauf zum amerikanischen Soldatenfriedhof (Colleville-sur-Mer) mit den tausenden weißen Kreuzen. Eine absolut andächtige Stimmung." },
      { type: "💣", text: "Abend: Batterie von Longues", info: "Kurzer Stopp in Longues-sur-Mer. Hier sind die originalen Geschütze des Atlantikwalls noch in den Bunkern erhalten. Danach Check-in im Base-Camp 3 (Bayeux)." }
    ], description: "Ein historisch extrem dichter und bewegender Tag.", researchTips: ["Audioguides für Kids am Friedhof leihen", "Respektvolle Kleidung am Friedhof", "Es kann hier sehr windig sein"] },

  { day: 6, title: "Comics & Juno Beach Action", location: "Bayeux & Juno Beach", accommodationId: 3, travelTime: "45 Min.", 
    details: [
      { type: "🧵", text: "Vormittag: Teppich von Bayeux", info: "🔬 Traveloptimizer: Besichtigung des 70 Meter langen, fast 1000 Jahre alten Wandteppichs. Er erzählt die Eroberung Englands wie ein mittelalterlicher Comic. Der spezielle Jugend-Audioguide ist großartig gemacht!" },
      { type: "🏰", text: "Mittag: Kathedrale & Bummel", info: "Spaziergang durch die vom Krieg verschonte Altstadt von Bayeux. Die normannisch-gotische Kathedrale Notre-Dame ist gigantisch." },
      { type: "⛵", text: "Nachmittag: Strandsegeln", info: "🔬 Traveloptimizer: Am Juno Beach (kanadischer Landungssektor) steht 'Char à Voile' auf dem Programm. Strandsegeln macht extrem viel Spaß, ist leicht zu lernen und liefert Adrenalin für die Teenager (bei Ebbe buchen!)." },
      { type: "🍽️", text: "Abend: Le Moulin de la Galette", info: "🔬 Traveloptimizer: Abendessen in Bayeux. Dieses Restaurant liegt wunderschön an der Aure, war früher eine Mühle und serviert unfassbar gute Galettes (herzhafte Crêpes)." }
    ], description: "Die perfekte Mischung aus Kunstgeschichte am Morgen und Vollgas am Strand am Nachmittag.", researchTips: ["Strandsegeln zwingend vorab online reservieren", "Tisch im Moulin de la Galette reservieren"] },

  { day: 7, title: "Das Wunder Mont-Saint-Michel", location: "Mont-Saint-Michel", accommodationId: 3, travelTime: "1,5 Std.", 
    details: [
      { type: "🚌", text: "Vormittag: Anreise & Shuttle", info: "Fahrt zur Küste. Das Auto wird weit außerhalb geparkt. Von dort geht man entweder 45 Min zu Fuß über die neue Brücke (toller Ausblick!) oder nimmt den kostenlosen Shuttle-Bus (Le Passeur)." },
      { type: "🌊", text: "Mittag: Wattwanderung & Treibsand", info: "🔬 Traveloptimizer: Geführte Wattwanderung! Ein lokaler Guide zeigt, wie schnell das Wasser kommt (wie ein galoppierendes Pferd) und macht mit der Gruppe sichere Treibsand-Experimente." },
      { type: "🏰", text: "Nachmittag: Die Abtei", info: "Aufstieg durch die engen, steilen Gassen der Grande Rue bis ganz nach oben zur Abtei. Die Architektur ('La Merveille') auf der Felsspitze ist meisterhaft." },
      { type: "🌙", text: "Abend: Les Nocturnes", info: "🔬 Traveloptimizer: Wenn möglich im Juli/August ab 19:30 Uhr bleiben. Dann starten die 'Nocturnes'. Die Abtei wird mit Licht und Musik inszeniert, und 80% der Tagestouristen sind bereits verschwunden. Magie pur!" }
    ], description: "Das berühmteste Fotomotiv Frankreichs intensiv erleben – abseits der Massen.", researchTips: ["Wattwanderung NUR mit Guide (Lebensgefahr durch Flut!)", "Handtuch für die Füße nach dem Watt einpacken", "Wasserflaschen mitnehmen (sehr teuer auf dem Berg)"] },

  { day: 8, title: "Piraten & Korsaren", location: "Saint-Malo", accommodationId: 4, travelTime: "1 Std.", 
    details: [
      { type: "🏴‍☠️", text: "Vormittag: Intra-Muros", info: "Willkommen in der Bretagne! Saint-Malo ist die Stadt der Freibeuter. 🔬 Traveloptimizer: Ein kompletter Spaziergang einmal um die Stadtmauer (Remparts) bietet die besten Ausblicke auf das Meer und die engen Steingassen." },
      { type: "🏝️", text: "Mittag: Fort National", info: "🔬 Traveloptimizer: Diese Festung liegt auf einer Insel vor der Stadt und ist NUR bei Ebbe zu Fuß erreichbar. Die Gezeiten dominieren hier das Leben." },
      { type: "🏖️", text: "Nachmittag: Strand & Pool", info: "Baden am Plage de l'Éventail oder (bei Ebbe) im freigelegten Meerwasserschwimmbecken direkt unterhalb der Stadtmauer mit eigenem Sprungturm." },
      { type: "🍦", text: "Abend: Eis bei Sanchez", info: "🔬 Traveloptimizer: Pflichtstopp bei 'Sanchez L'Artisan Glacier' in der Altstadt. Es gibt über 50 teils verrückte Sorten. Die Warteschlange ist lang, aber es ist das beste Eis der Region!" }
    ], description: "Korsaren-Flair, trutzige Mauern und das raue Meer.", researchTips: ["Parken im unterirdischen P1 Saint-Vincent", "Coddy App für eine Piraten-Stadtrallye laden"] },

  { day: 9, title: "Dinan & Austern", location: "Dinan & Cancale", accommodationId: 4, travelTime: "1,2 Std.", 
    details: [
      { type: "🏰", text: "Vormittag: Dinan & Rue du Jerzual", info: "Dinan ist das vielleicht schönste Fachwerk-Städtchen der Bretagne. 🔬 Traveloptimizer: Die steile, kopfsteingepflasterte 'Rue du Jerzual' voller kleiner Kunsthandwerker hinab zum Flusshafen der Rance spazieren." },
      { type: "⛵", text: "Mittag: Katamaran-Option", info: "Wer Action sucht: An der Küste (Saint-Malo/Dinard) einen halbtägigen Katamaran-Schnupperkurs für die Teenager buchen. Alternativ entspannt am Flusshafen in Dinan essen." },
      { type: "🦪", text: "Nachmittag: Austernmarkt Cancale", info: "🔬 Traveloptimizer: Fahrt nach Cancale zum 'Marché aux Huîtres' am Pier. Einen Teller fangfrische Austern für wenige Euro kaufen, auf die Kaimauer setzen, essen und die leeren Schalen traditionell ins Watt werfen!" },
      { type: "👀", text: "Abend: Pointe du Grouin", info: "Von Cancale aus zur felsigen Landzunge Pointe du Grouin fahren. Von hier überblickt man die gesamte Bucht und sieht bei klarem Wetter bis zum Mont-Saint-Michel." }
    ], description: "Ein Tag voller kulinarischer Traditionen und mittelalterlicher Romantik.", researchTips: ["Bequeme Sneaker für die extrem steilen Gassen in Dinan", "Feuchttücher für die Hände nach den Austern"] },

  { day: 10, title: "Klippen & Smaragdwasser", location: "Cap Fréhel", accommodationId: 4, travelTime: "1 Std.", 
    details: [
      { type: "🦅", text: "Vormittag: Cap Fréhel", info: "Spaziergang an den 70m hohen, roten Sandsteinklippen des Cap Fréhel. Im Sommer blüht hier das Heidekraut violett und gelb. Die Klippen sind Heimat unzähliger Seevögel." },
      { type: "🥾", text: "Mittag: Wanderung Fort La Latte", info: "🔬 Traveloptimizer: Auf dem Küstenpfad vom Cap in ca. 1,5 Stunden zur Festung 'Fort La Latte' wandern. Die Burg diente unzähligen Filmen (u.a. mit Kirk Douglas) als dramatische Kulisse." },
      { type: "🏖", text: "Nachmittag: Sables-d'Or", info: "🔬 Traveloptimizer: Fahrt zum Strandbad 'Sables-d'Or-les-Pins'. Der endlose Sandstrand und das smaragdgrüne, kristallklare Wasser versprühen fast karibisches Flair. Perfekt zum Ausruhen." },
      { type: "🍽️", text: "Abend: Galette Saucisse", info: "An einem Foodtruck oder kleinen Imbiss das bretonische Streetfood schlechthin probieren: Eine Grillwurst, eingewickelt in einen herzhaften Buchweizen-Crêpe (Galette)." }
    ], description: "Die wilde, windumtoste Schönheit der Smaragdküste.", researchTips: ["Fernglas für die Vogelkolonien mitnehmen", "Windbreaker für das Cap unerlässlich", "Sonnencreme (Wind täuscht über UV-Strahlung hinweg)"] },

  { day: 11, title: "Rosa Granitsteine", location: "Perros-Guirec", accommodationId: 5, travelTime: "1,5 Std.", 
    details: [
      { type: "🚗", text: "Vormittag: Fahrt nach Westen", info: "Quartierwechsel. Fahrt in das Département Côtes-d’Armor an die 'Côte de Granit Rose'. Check-in im Base Camp 5." },
      { type: "🪨", text: "Mittag: Sentier des Douaniers", info: "🔬 Traveloptimizer: Wanderung auf dem alten Zöllnerpfad bei Ploumanac'h. Ziel ist der Leuchtturm Mean Ruz, der komplett aus rosa Felsbrocken erbaut wurde und mit der Küste verschmilzt." },
      { type: "🧗", text: "Nachmittag: Natural Bouldering", info: "Überall an der Küste liegen haushohe, rundgeschliffene Granitblöcke herum, die wie Kieselsteine eines Riesen wirken. Für Teenager der perfekte Abenteuerspielplatz zum Klettern und Verstecken." },
      { type: "🌅", text: "Abend: Rosa Sonnenuntergang", info: "Unbedingt bis zum Sonnenuntergang an den Felsen bleiben. Das abendliche Licht lässt das enthaltene Feldspat intensiv rosa bis orange glühen. Magisch!" }
    ], description: "Eine Küstenlandschaft, die aussieht wie von einem anderen Planeten.", researchTips: ["Bequeme Kletterschuhe/Sneaker für die Kids", "Die App 'PeakFinder' (oder ähnliche) macht Spaß bei den Gesteinsformen"] },

  { day: 12, title: "Blumeninsel Bréhat", location: "Île de Bréhat", accommodationId: 5, travelTime: "1 Std.", 
    details: [
      { type: "⛴️", text: "Vormittag: Fähre ab L'Arcouest", info: "Fahrt zur Pointe de l'Arcouest und 10-minütige Überfahrt zur Île de Bréhat (Vedettes de Bréhat). Das Klima hier ist durch den Golfstrom so mild, dass Palmen, Feigen und Agapanthus blühen." },
      { type: "🚲", text: "Mittag: Fahrrad-Erkundung", info: "🔬 Traveloptimizer: Die Insel ist streng autofrei! Fahrräder mieten und zuerst die mediterran anmutende Südinsel, dann die wildere, raue Nordinsel erkunden. Ziel: Der Leuchtturm Phare du Paon." },
      { type: "🚤", text: "Nachmittag: Zodiac Robbentour", info: "🔬 Traveloptimizer: Zurück am Festland eine Fahrt im rasanten Festrumpfschlauchboot (Zodiac) zu den vorgelagerten Riffen und Robbenkolonien machen. Action pur nach dem beschaulichen Inselbesuch." },
      { type: "🍻", text: "Abend: Bretonischer Cidre", info: "Den Tag in einer typischen Crêperie ausklingen lassen. Für die Erwachsenen trockenen Cidre (Brut) aus der Bolée (Tonschale) trinken." }
    ], description: "Ein Mikrokosmos im Meer: Von blühenden Gärten zu rauen Klippen.", researchTips: ["Fährtickets am besten vorab online buchen", "Picknick mitnehmen, Restaurants auf der Insel sind teuer"] },

  { day: 13, title: "Huelgoat & Concarneau", location: "Huelgoat & Südbretagne", accommodationId: 6, travelTime: "2,5 Std.", 
    details: [
      { type: "🌳", text: "Vormittag: Fahrt ins Landesinnere", info: "Wir verlassen die Nordküste und fahren in das waldige Herz der Bretagne (Finistère)." },
      { type: "🧙", text: "Mittag: Huelgoat Sagenwald", info: "🔬 Traveloptimizer: Wanderung im 'Chaos de Huelgoat'. Riesige, moosbewachsene Felsbrocken mitten im Wald. Den 137 Tonnen schweren 'Roche Tremblante' (Zitternder Stein) suchen und versuchen, ihn zum Wackeln zu bringen!" },
      { type: "🔦", text: "Nachmittag: Grotte des Teufels", info: "Ebenfalls in Huelgoat: Über steile Leitern tief hinab in die 'Grotte du Diable' steigen, unter der der Fluss tost. Taschenlampen auf dem Handy bereithalten!" },
      { type: "🏰", text: "Abend: Ville Close Concarneau", info: "Ankunft an der Südküste (Check-in Base Camp 6). Abends die Ville Close, eine komplett von Mauern umschlossene Stadt auf einer Insel im Hafen von Concarneau, besichtigen. Abends viel atmosphärischer als tagsüber!" }
    ], description: "Ein Tag voller bretonischer Mythen, Feen und mystischer Wälder.", researchTips: ["Wald ist oft feucht – rutschfestes Profil zwingend!", "Picknick an einem der Feenbecken im Wald"] },

  { day: 14, title: "Karibik der Bretagne", location: "Glénan-Archipel", accommodationId: 6, travelTime: "1 Std. Boot", 
    details: [
      { type: "🛳️", text: "Vormittag: Bootsfahrt", info: "🔬 Traveloptimizer: In Bénodet oder Concarneau an Bord der 'Vedettes de l'Odet' gehen. Etwa 1 Stunde Fahrt hinaus auf den Atlantik zu einem Archipel, das aussieht wie auf den Malediven." },
      { type: "🏝", text: "Mittag: Insel Saint-Nicolas", info: "Ankunft auf der Hauptinsel. Puderzuckerweißer Sand, keine Straßen, kein Lärm. Das Wasser leuchtet in unglaublichen Türkis- und Blautönen." },
      { type: "🤿", text: "Nachmittag: Kajak & Schnorcheln", info: "🔬 Traveloptimizer: Achtung! Es sieht aus wie Karibik, aber das Atlantikwasser ist hier maximal 16-18 Grad warm. Wer schnorcheln oder Kajak fahren will, leiht sich am besten vorher einen Shorty-Neoprenanzug." },
      { type: "⛱️", text: "Abend: Rückkehr ans Festland", info: "Rückfahrt am späten Nachmittag. Den Abend entspannt an der Uferpromenade in Bénodet oder am Strand von Cap Coz ausklingen lassen." }
    ], description: "Ein Naturwunder aus Sandbänken und dem klarsten Wasser Frankreichs.", researchTips: ["TICKETS WOCHEN VORHER BUCHEN!", "Sonnenschirm/Strandmuschel mitbringen (Inseln sind baumlos!)", "Viel Trinkwasser einpacken"] },

  { day: 15, title: "Brocéliande & Vannes", location: "Morbihan & Nantes", accommodationId: 7, travelTime: "3,5 Std.", 
    details: [
      { type: "🚗", text: "Vormittag: Aufbruch gen Osten", info: "Rückreise-Etappe Richtung Nantes. Der Weg führt durch das Département Morbihan." },
      { type: "🧙", text: "Mittag: Wald von Brocéliande", info: "🔬 Traveloptimizer: Stopp im legendären Wald von Paimpont (Brocéliande). Hier entspringen die Artus-Sagen. Den 'Feenspiegel' (See) besuchen und eine Schleife durch das 'Val sans Retour' (Tal ohne Wiederkehr) zum Goldenen Baum wandern." },
      { type: "🏛", text: "Nachmittag: Vannes Altstadt", info: "Fahrt an den Golf von Morbihan. Kaffeepause in Vannes. Die Stadt hat fantastische bunte Fachwerkhäuser, eine imposante Stadtmauer und einen Yachthafen, der bis in die Altstadt reicht." },
      { type: "🏨", text: "Abend: Ankunft in Nantes", info: "Fahrt zum finalen Base Camp in Nantes. Einchecken, Mietwagen eventuell schon heute abgeben oder für morgen früh bereithalten." }
    ], description: "Ritterlegenden im Wald und maritimes Stadtflair am Golf.", researchTips: ["Infos im Touristenbüro Paimpont (Schloss Comper) holen", "Kouign-Amann (bretonischer Butterkuchen) in Vannes kaufen!"] },

  { day: 16, title: "Steampunk-Finale & Abflug", location: "Nantes & Flughafen NTE", accommodationId: null, travelTime: "30 Min.", 
    details: [
      { type: "🐘", text: "Vormittag: Les Machines de l'Île", info: "🔬 Traveloptimizer: Das absolute Highlight von Nantes! Ein riesiger, 12 Meter hoher, mechanischer Elefant aus Holz und Stahl spaziert über das alte Werftgelände. Man kann sogar auf ihm reiten (Tickets lange vorher buchen!). Eine Mischung aus Jules Verne und Steampunk." },
      { type: "🛍️", text: "Mittag: Passage Pommeraye", info: "Letztes Shopping und Flanieren in der überdachten, prächtigen Einkaufsgalerie aus dem 19. Jahrhundert. Tolle Fotomotive auf den Treppen." },
      { type: "✈️", text: "Nachmittag: Transfer NTE", info: "Ab zum Flughafen Nantes (NTE). Falls noch nicht geschehen: Mietwagen vollgetankt zurückgeben (Tankquittung aufheben!)." },
      { type: "🛫", text: "Abend: Flug nach Wien", info: "Check-in und Rückflug nach Hause. Ein Abenteuer mit über 1800 gefahrenen Kilometern, Piraten, Felsen und Achterbahnen geht zu Ende." }
    ], description: "Mechanische Wunderwerke in der Heimatstadt von Jules Verne als krönender Abschluss.", researchTips: ["Elefanten-Ritt Wochen vorher online buchen", "Grüne Linie am Boden in Nantes folgen (führt zu allen Kunstwerken)", "Zeit für Mietwagenübergabe großzügig bemessen"] }
];

const locationCoordinates: Record<string, { lat: number, lon: number }> = {
  "Roissy / Plailly": { lat: 49.10, lon: 2.56 },
  "Vernon & Rouen": { lat: 49.44, lon: 1.09 },
  "Étretat": { lat: 49.70, lon: 0.20 },
  "Honfleur & Deauville": { lat: 49.42, lon: 0.23 },
  "Omaha Beach": { lat: 49.37, lon: -0.88 },
  "Bayeux & Juno Beach": { lat: 49.27, lon: -0.70 },
  "Mont-Saint-Michel": { lat: 48.63, lon: -1.51 },
  "Saint-Malo": { lat: 48.64, lon: -2.01 },
  "Dinan & Cancale": { lat: 48.45, lon: -2.04 },
  "Cap Fréhel": { lat: 48.68, lon: -2.31 },
  "Perros-Guirec": { lat: 48.81, lon: -3.44 },
  "Île de Bréhat": { lat: 48.84, lon: -2.99 },
  "Huelgoat & Südbretagne": { lat: 48.36, lon: -3.74 },
  "Glénan-Archipel": { lat: 47.71, lon: -3.99 },
  "Morbihan & Nantes": { lat: 47.65, lon: -2.75 },
  "Nantes & Flughafen NTE": { lat: 47.21, lon: -1.55 }
};

const WeatherWidget = ({ location }: { location: string }) => {
  const [weather, setWeather] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const coords = locationCoordinates[location];
    if (!coords) {
      setLoading(false);
      return;
    }

    const fetchWeather = async () => {
      try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=Europe%2FBerlin`);
        const data = await res.json();
        setWeather(data);
      } catch (err) {
        console.error("Failed to fetch weather", err);
      } finally {
        setLoading(false);
      }
    };
    fetchWeather();
  }, [location]);

  if (loading) return <div className="animate-pulse bg-gray-200 h-16 w-full rounded-xl mb-6"></div>;
  if (!weather) return null;

  const code = weather.current.weather_code;
  let Icon = Sun;
  let color = "text-yellow-500";
  if (code >= 1 && code <= 3) { Icon = Cloud; color = "text-gray-400"; }
  if (code >= 51 && code <= 67) { Icon = CloudRain; color = "text-blue-500"; }
  if (code >= 71 && code <= 77) { Icon = Snowflake; color = "text-blue-300"; }
  if (code >= 95) { Icon = CloudLightning; color = "text-purple-500"; }

  return (
    <div className="flex items-center gap-4 bg-white/80 backdrop-blur-sm p-4 border-2 border-[#00162B]/10 shadow-sm mb-6">
      <div className={`p-3 bg-gray-50 rounded-full ${color}`}>
        <Icon size={28} />
      </div>
      <div>
        <p className="text-[10px] font-black uppercase text-gray-500 tracking-widest mb-1">Aktuelles Wetter in {location}</p>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-black text-[#00162B]">{Math.round(weather.current.temperature_2m)}°C</span>
          <span className="text-sm font-bold text-gray-400">
            {Math.round(weather.daily.temperature_2m_min[0])}° - {Math.round(weather.daily.temperature_2m_max[0])}°
          </span>
        </div>
      </div>
    </div>
  );
};

const App = () => {
  const [activeDay, setActiveDay] = useState(1);
  const [view, setView] = useState('plan'); 
  const [selectedMapPoint, setSelectedMapPoint] = useState<number | null>(null);
  const [activeMember, setActiveMember] = useState('Papa');
  const [newItemName, setNewItemName] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('Allgemein');
  const [expandedDetails, setExpandedDetails] = useState<Record<number, boolean>>({});

  const [accommodations, setAccommodations] = useState(defaultAccommodations);
  const [flights, setFlights] = useState(defaultFlights);
  const [familyPacking, setFamilyPacking] = useState<Record<string, any[]>>(getDefaultPacking());

  // AI States
  const [aiTip, setAiTip] = useState<string | null>(null);
  const [aiFood, setAiFood] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showBriefingModal, setShowBriefingModal] = useState(false);

  useEffect(() => {
    const tripRef = doc(db, 'trips', 'shared_trip');
    const unsubscribe = onSnapshot(tripRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.accommodations) setAccommodations(JSON.parse(data.accommodations));
        if (data.flights) setFlights(JSON.parse(data.flights));
        if (data.familyPacking) setFamilyPacking(JSON.parse(data.familyPacking));
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `trips/shared_trip`);
    });

    return () => unsubscribe();
  }, []);

  const saveToFirebase = async () => {
    try {
      const tripRef = doc(db, 'trips', 'shared_trip');
      await setDoc(tripRef, {
        ownerId: 'shared_trip',
        accommodations: JSON.stringify(accommodations),
        flights: JSON.stringify(flights),
        familyPacking: JSON.stringify(familyPacking)
      }, { merge: true });
      setShowSaveModal(false);
      // Optional: Add a toast notification here instead of alert if desired
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `trips/shared_trip`);
    }
  };

  const currentDay = itinerary[activeDay - 1] || itinerary[0];
  const currentAcc = accommodations.find(a => a.id === currentDay.accommodationId);
  
  const memberPacking = familyPacking[activeMember] || [];
  const packedCount = memberPacking.filter(i => i.checked).length;
  const packedPercent = memberPacking.length > 0 ? Math.round((packedCount / memberPacking.length) * 100) : 0;

  const groupedItems = memberPacking.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, any[]>);

  const fetchGeminiResponse = async (prompt: string) => {
    setAiLoading(true);
    setAiError(null);
    
    if (!ai) {
      setAiError("Gemini API Key fehlt in den Netlify Environment Variables.");
      setAiLoading(false);
      return null;
    }

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: prompt,
        config: {
          systemInstruction: "Du bist ein Reiseexperte für Frankreich. Antworte immer im 'Red Bull' Stil: energiegeladen, direkt und motivierend. Fokus auf Teenager-Kids (12/14). Nutze Emojis."
        }
      });
      return response.text;
    } catch (err) {
      setAiError("KI momentan offline.");
      return null;
    } finally {
      setAiLoading(false);
    }
  };

  const generateAiContent = async (type: string) => {
    const prompt = type === 'tip' 
      ? `Insider-Tipp für Teenager in ${currentDay.location} für den Tag: ${currentDay.title}. Action oder Secret Spot.`
      : `Was ist das beste Essen für Teenager in ${currentDay.location}? Kurzer regionaler Food-Tipp.`;
    const res = await fetchGeminiResponse(prompt);
    if (res) type === 'tip' ? setAiTip(res) : setAiFood(res);
  };

  const toggleDetail = (index: number) => {
    setExpandedDetails(prev => ({ ...prev, [index]: !prev[index] }));
  };

  const updateAccommodation = (id: number, field: string, value: string) => {
    setAccommodations(prev => prev.map(acc => acc.id === id ? { ...acc, [field]: value } : acc));
  };

  const updateFlight = (id: string, field: string, value: string) => {
    setFlights(prev => prev.map(fl => fl.id === id ? { ...fl, [field]: value } : fl));
  };

  const addItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;
    const newItem = { id: Date.now(), name: newItemName.trim(), category: newItemCategory, checked: false };
    setFamilyPacking(prev => ({ ...prev, [activeMember]: [...(prev[activeMember] || []), newItem] }));
    setNewItemName('');
  };

  const removeItem = (itemId: number) => {
    setFamilyPacking(prev => ({ ...prev, [activeMember]: (prev[activeMember] || []).filter(item => item.id !== itemId) }));
  };

  const toggleItem = (itemId: number) => {
    setFamilyPacking(prev => ({ ...prev, [activeMember]: (prev[activeMember] || []).map(item => item.id === itemId ? { ...item, checked: !item.checked } : item) }));
  };

  const renderMap = () => {
    const points = [
      { x: 350, y: 150, label: "Paris", id: 1 },
      { x: 280, y: 80, label: "Étretat", id: 4 },
      { x: 220, y: 110, label: "Bayeux", id: 6 },
      { x: 180, y: 160, label: "MSM", id: 8 },
      { x: 140, y: 170, label: "St-Malo", id: 9 },
      { x: 60, y: 150, label: "P. Guirec", id: 11 },
      { x: 40, y: 220, label: "Concarneau", id: 13 },
      { x: 180, y: 260, label: "Nantes", id: 15 }
    ];

    const selectedItinerary = selectedMapPoint ? itinerary.find(i => i.day === selectedMapPoint) : null;

    return (
      <div className="bg-[#00162B] p-8 border-4 border-[#DB0A40] shadow-[12px_12px_0px_0px_#00162B] mb-8 animate-in zoom-in duration-300 relative">
        <h2 className="text-white font-black uppercase text-2xl mb-6 italic tracking-tighter text-center">Route Tracker</h2>
        <div className="relative w-full aspect-[4/3] bg-[#002244] rounded-lg overflow-hidden border border-white/10">
          <svg viewBox="0 0 400 300" className="w-full h-full">
            <path d="M400,100 Q300,50 250,80 T150,150 T50,130 T0,200" fill="none" stroke="#DB0A40" strokeWidth="2" strokeDasharray="5,5" className="opacity-20" />
            <polyline points={points.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#DB0A40" strokeWidth="4" strokeLinejoin="round" />
            {points.map((p) => (
              <g key={p.id} onClick={() => setSelectedMapPoint(p.id)} className="cursor-pointer group">
                <motion.circle 
                  cx={p.x} 
                  cy={p.y} 
                  animate={{ 
                    r: selectedMapPoint === p.id ? 10 : 6, 
                    fill: selectedMapPoint === p.id ? "#DB0A40" : "#FFFFFF" 
                  }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className="group-hover:stroke-[#DB0A40] stroke-2"
                />
                <motion.text 
                  x={p.x + 15} 
                  y={p.y + 4} 
                  animate={{
                    fill: selectedMapPoint === p.id ? "#DB0A40" : "#FFFFFF",
                    scale: selectedMapPoint === p.id ? 1.1 : 1
                  }}
                  fontSize="10" 
                  className="font-black uppercase tracking-tighter transition-colors"
                >
                  {p.label}
                </motion.text>
              </g>
            ))}
          </svg>

          <AnimatePresence>
            {selectedItinerary && (
              <motion.div 
                key="map-popup"
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.95 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                className="absolute bottom-4 left-4 right-4 bg-white border-4 border-[#DB0A40] p-5 shadow-[8px_8px_0px_0px_#00162B] z-10"
              >
                <button 
                  onClick={() => setSelectedMapPoint(null)}
                  className="absolute top-2 right-2 text-gray-400 hover:text-[#DB0A40] transition-colors z-20"
                >
                  <span className="font-black text-xl leading-none">&times;</span>
                </button>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={selectedItinerary.day}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="flex items-center gap-2 text-[#DB0A40] mb-2 font-black uppercase tracking-widest text-xs">
                      <MapPin size={16} /> {selectedItinerary.location}
                    </div>
                    <h3 className="text-xl font-black uppercase leading-tight italic mb-2 text-[#00162B] pr-6">
                      {selectedItinerary.title}
                    </h3>
                    <p className="text-sm font-bold text-gray-600 mb-4 line-clamp-2">
                      {selectedItinerary.description}
                    </p>
                    <button 
                      onClick={() => { setActiveDay(selectedItinerary.day); setView('plan'); setSelectedMapPoint(null); }}
                      className="w-full bg-[#00162B] text-white font-black py-3 uppercase text-xs hover:bg-[#DB0A40] transition-colors flex items-center justify-center gap-2"
                    >
                      Zum Tagesplan <ArrowRight size={16} />
                    </button>
                  </motion.div>
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  };

  useEffect(() => {
    setAiTip(null);
    setAiFood(null);
  }, [activeDay]);

  return (
    <div className="min-h-screen bg-[#F8F9FA] font-sans text-[#00162B] pb-24">
      {/* HEADER */}
      <header className="bg-[#00162B] text-white p-6 shadow-2xl border-b-8 border-[#DB0A40] sticky top-0 z-50">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <div onClick={() => setView('plan')} className="cursor-pointer group">
            <h1 className="text-2xl md:text-3xl font-black uppercase tracking-tighter italic">Roadtrip 2026</h1>
            <p className="text-[10px] font-bold text-[#DB0A40] tracking-widest uppercase">Frankreich • 16 Tage</p>
          </div>
          <nav className="flex gap-2">
            {[
              { id: 'plan', icon: Calendar },
              { id: 'map', icon: MapIcon },
              { id: 'accommodations', icon: Bed },
              { id: 'packing', icon: Briefcase },
              { id: 'admin', icon: Settings }
            ].map(nav => (
              <button 
                key={nav.id} 
                onClick={() => setView(nav.id)} 
                className={`p-2 rounded-none transition-all ${view === nav.id ? 'bg-[#DB0A40] text-white rotate-3 scale-110 shadow-lg' : 'opacity-40 hover:opacity-100'}`}
              >
                <nav.icon size={20} />
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* DASHBOARD BAR */}
      <div className="bg-white border-b-2 border-gray-100 py-3 hidden md:block">
        <div className="max-w-5xl mx-auto flex justify-around text-[10px] font-black uppercase tracking-widest text-gray-400">
          <div className="flex items-center gap-2"><LayoutDashboard size={14} className="text-[#DB0A40]"/> 16 Tage Mission</div>
          <div className="flex items-center gap-2"><MapPin size={14} className="text-[#DB0A40]"/> Wien -&gt; Paris -&gt; Nantes</div>
          <div className="flex items-center gap-2"><Home size={14} className="text-[#DB0A40]"/> 7 Base Camps</div>
          <div className="flex items-center gap-2"><Percent size={14} className="text-[#DB0A40]"/> {packedPercent}% Ready</div>
        </div>
      </div>

      <main className="max-w-5xl mx-auto p-4 md:p-8">
        {/* TAGESPLAN VIEW */}
        {view === 'plan' && (
          <div className="animate-in fade-in slide-in-from-bottom-8 duration-500">
            <div className="flex items-center gap-2 mb-8 no-scrollbar overflow-x-auto pb-4 sticky top-24 z-40 bg-[#F8F9FA]/90 backdrop-blur-sm pt-2">
              {itinerary.map((item) => (
                <button 
                  key={item.day} 
                  onClick={() => setActiveDay(item.day)} 
                  className={`flex-shrink-0 w-12 h-12 font-black flex items-center justify-center transition-all border-4 ${
                    activeDay === item.day ? 'bg-[#00162B] text-white border-[#DB0A40] shadow-[4px_4px_0px_0px_#DB0A40]' : 'bg-white border-gray-200 hover:border-[#00162B]'
                  }`}
                >
                  {item.day}
                </button>
              ))}
            </div>

            <div className="bg-white border-8 border-[#00162B] p-6 md:p-10 shadow-[20px_20px_0px_0px_#00162B] relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#DB0A40] rotate-45 translate-x-16 -translate-y-16"></div>
              
              <div className="flex items-center gap-2 text-[#DB0A40] mb-4 font-black uppercase tracking-widest text-sm">
                <MapPin size={20} /> {currentDay.location}
              </div>
              
              <h2 className="text-4xl md:text-7xl font-black mb-8 uppercase leading-none tracking-tighter italic">
                {currentDay.title}
              </h2>
              
              <WeatherWidget location={currentDay.location} />
              
              <div className="flex flex-wrap gap-4 mb-10">
                <div className="flex items-center gap-2 bg-gray-100 px-5 py-3 font-black text-sm border-2 border-gray-200 shadow-sm">
                  <Clock size={20} className="text-[#00162B]" />
                  Fahrzeit: <span className="text-[#DB0A40]">{currentDay.travelTime}</span>
                </div>
                {currentAcc && (
                  <div className="flex items-center gap-2 bg-[#00162B] text-white px-5 py-3 font-black text-sm shadow-md">
                    <Home size={20} className="text-[#DB0A40]" />
                    <span className="uppercase">{currentAcc.name}</span>
                  </div>
                )}
                <button 
                  onClick={() => setShowBriefingModal(true)}
                  className="flex items-center gap-2 bg-[#DB0A40] text-white px-5 py-3 font-black text-sm shadow-[4px_4px_0px_0px_#00162B] hover:translate-y-1 hover:shadow-none transition-all"
                >
                  <BookOpen size={20} />
                  TAGES-BRIEFING
                </button>
              </div>

              <div className="grid md:grid-cols-2 gap-10 mb-12">
                <div className="space-y-6">
                  <h3 className="font-black border-l-8 border-[#DB0A40] pl-4 uppercase text-2xl italic tracking-tighter">Mission</h3>
                  <div className="space-y-4">
                    {currentDay.details.map((detail, i) => (
                      <div key={i} className="border-4 border-[#00162B] bg-gray-50 overflow-hidden shadow-lg transition-all">
                        <button 
                          onClick={() => toggleDetail(i)}
                          className="w-full flex items-center justify-between p-5 hover:bg-white transition-colors"
                        >
                          <div className="flex items-center gap-4">
                            <span className="text-4xl">{detail.type}</span>
                            <span className="text-sm font-black uppercase text-left">{detail.text}</span>
                          </div>
                          {expandedDetails[i] ? <ChevronUp className="text-[#DB0A40]" /> : <ChevronDown className="text-gray-300" />}
                        </button>
                        {expandedDetails[i] && (
                          <div className="p-6 bg-white border-t-4 border-[#00162B] text-sm font-bold leading-relaxed animate-in slide-in-from-top-4 duration-300">
                            {detail.info}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-[#00162B] text-white p-10 relative">
                  <div className="absolute top-4 right-4 text-[#DB0A40] opacity-30"><BookOpen size={64}/></div>
                  <h3 className="font-black border-l-8 border-[#DB0A40] pl-4 uppercase text-2xl italic mb-8 tracking-tighter">Pro-Tips</h3>
                  <ul className="space-y-5">
                    {currentDay.researchTips.map((tip, i) => (
                      <li key={i} className="text-xs flex gap-4 font-black opacity-80 leading-relaxed uppercase tracking-wide">
                        <CheckCircle size={18} className="text-[#DB0A40] flex-shrink-0 mt-0.5" />
                        {tip}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6 mb-12">
                <div className="bg-gradient-to-br from-[#00162B] to-[#002244] p-8 text-white border-l-8 border-[#DB0A40] shadow-2xl group">
                  <h3 className="flex items-center gap-3 font-black uppercase text-sm tracking-widest mb-6 italic">
                    <Wand2 size={24} className="text-[#DB0A40]" /> KI Insider Action ✨
                  </h3>
                  {!aiTip ? (
                    <button 
                      onClick={() => generateAiContent('tip')} 
                      disabled={aiLoading}
                      className="w-full bg-[#DB0A40] text-white font-black py-4 uppercase text-xs hover:bg-white hover:text-black transition-all shadow-[6px_6px_0px_0px_#000]"
                    >
                      {aiLoading ? "Analysiere Daten..." : "Insider-Check starten"}
                    </button>
                  ) : (
                    <div className="relative animate-in fade-in zoom-in duration-300">
                      <p className="text-sm font-black leading-relaxed mb-4 italic pr-10 tracking-tight">"{aiTip}"</p>
                      <button onClick={() => { navigator.clipboard.writeText(aiTip); }} className="absolute top-0 right-0 p-2 text-[#DB0A40] hover:text-white transition-colors">
                        <Copy size={20} />
                      </button>
                    </div>
                  )}
                </div>

                <div className="bg-white border-8 border-dashed border-[#00162B] p-8 shadow-2xl relative">
                  <h3 className="flex items-center gap-3 font-black uppercase text-sm tracking-widest mb-6 italic text-[#00162B]">
                    <Utensils size={24} className="text-[#DB0A40]" /> KI Food Guide ✨
                  </h3>
                  {!aiFood ? (
                    <button 
                      onClick={() => generateAiContent('food')} 
                      disabled={aiLoading}
                      className="w-full border-4 border-[#00162B] text-[#00162B] font-black py-3 uppercase text-xs hover:bg-[#00162B] hover:text-white transition-all shadow-[6px_6px_0px_0px_#DB0A40]"
                    >
                      Regionaler Snack-Guide
                    </button>
                  ) : (
                    <div className="relative animate-in fade-in zoom-in duration-300">
                      <p className="text-sm font-black leading-relaxed text-[#00162B] italic pr-10 tracking-tight">"{aiFood}"</p>
                      <button onClick={() => { navigator.clipboard.writeText(aiFood); }} className="absolute top-0 right-0 p-2 text-[#DB0A40] hover:text-[#00162B] transition-colors">
                        <Copy size={20} />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-between border-t-8 border-[#00162B] pt-10">
                <button 
                  disabled={activeDay === 1}
                  onClick={() => setActiveDay(prev => prev - 1)}
                  className="flex items-center gap-3 font-black uppercase text-lg italic disabled:opacity-20 hover:text-[#DB0A40] transition-colors"
                >
                  <ChevronLeft size={32} /> Back
                </button>
                <button 
                  disabled={activeDay === itinerary.length}
                  onClick={() => setActiveDay(prev => prev + 1)}
                  className="flex items-center gap-3 font-black uppercase text-lg italic disabled:opacity-20 hover:text-[#DB0A40] transition-colors"
                >
                  Next Day <ChevronRight size={32} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ACCOMMODATIONS VIEW */}
        {view === 'accommodations' && (
          <div className="space-y-10 animate-in fade-in duration-500">
            <h2 className="text-5xl md:text-7xl font-black uppercase tracking-tighter italic border-b-[12px] border-[#DB0A40] inline-block mb-10">Base Camps</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {accommodations.map((acc) => (
                <div key={acc.id} className="border-8 border-[#00162B] flex flex-col shadow-[12px_12px_0px_0px_#00162B] group hover:-translate-y-3 transition-transform bg-white">
                  <div className={`${acc.color} text-white p-6 flex justify-between items-start`}>
                    <div>
                      <span className="text-[10px] font-black uppercase opacity-70 tracking-widest">{acc.days}</span>
                      <h3 className="text-2xl font-black uppercase leading-tight italic">{acc.name}</h3>
                    </div>
                    <div className="bg-white/20 px-3 py-1 font-black text-xs uppercase tracking-tighter">{acc.nights} N.</div>
                  </div>
                  <div className="p-8 flex-1">
                    <div className="flex items-center gap-3 text-[#DB0A40] mb-6 font-black uppercase text-sm italic">
                      <Hotel size={20} /> {acc.type}
                    </div>
                    <p className="text-sm text-gray-400 mb-8 italic font-bold">"{acc.note}"</p>
                    <div className="border-t-4 border-gray-100 pt-6">
                      <p className="text-[11px] font-black leading-relaxed uppercase opacity-70 tracking-widest">{acc.highlights}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PACKING VIEW */}
        {view === 'packing' && (
          <div className="space-y-10 animate-in fade-in duration-500">
            <div className="flex justify-between items-end mb-10">
              <h2 className="text-5xl md:text-7xl font-black uppercase tracking-tighter italic border-b-[12px] border-[#DB0A40] inline-block">Gepäck</h2>
              <div className="text-right">
                <div className="text-5xl font-black italic text-[#00162B] leading-none">{packedPercent}%</div>
                <div className="text-[10px] font-black uppercase tracking-widest text-[#DB0A40] mt-2">Ready to Go</div>
              </div>
            </div>

            <div className="flex overflow-x-auto gap-4 no-scrollbar mb-10">
              {familyMembers.map(member => (
                <button 
                  key={member} 
                  onClick={() => setActiveMember(member)} 
                  className={`flex-shrink-0 px-10 py-5 font-black uppercase text-sm transition-all border-8 ${
                    activeMember === member 
                    ? 'bg-[#DB0A40] text-white border-[#DB0A40] shadow-[10px_10px_0px_0px_#00162B] -rotate-2' 
                    : 'bg-white text-gray-300 border-gray-200 hover:border-[#00162B]'
                  }`}
                >
                  <div className="flex items-center gap-3"><User size={20} />{member}</div>
                </button>
              ))}
            </div>

            <div className="grid lg:grid-cols-3 gap-10">
              <div className="lg:col-span-1 space-y-8">
                <div className="bg-white p-8 border-8 border-[#00162B] shadow-[12px_12px_0px_0px_#DB0A40]">
                  <h3 className="font-black uppercase text-xs mb-6 flex items-center gap-3 text-[#DB0A40] tracking-widest italic">
                    <Plus size={24} /> New Gear hinzufügen
                  </h3>
                  <form onSubmit={addItem} className="space-y-6">
                    <input 
                      type="text" 
                      value={newItemName} 
                      onChange={(e) => setNewItemName(e.target.value)} 
                      placeholder="Was muss noch mit?" 
                      className="w-full border-4 border-[#00162B] px-4 py-4 font-black text-sm outline-none"
                    />
                    <select 
                      value={newItemCategory} 
                      onChange={(e) => setNewItemCategory(e.target.value)} 
                      className="w-full border-4 border-[#00162B] px-4 py-4 font-black text-xs bg-white uppercase"
                    >
                      {defaultCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                    <button type="submit" className="w-full bg-[#DB0A40] text-white font-black py-4 uppercase text-xs hover:bg-[#00162B] transition-colors">Hinzufügen</button>
                  </form>
                </div>
              </div>

              <div className="lg:col-span-2 grid md:grid-cols-2 gap-8">
                {Object.entries(groupedItems).sort().map(([category, items]: [string, any[]]) => (
                  <div key={category} className="bg-white border-8 border-[#00162B] p-8 shadow-[12px_12px_0px_0px_#00162B]">
                    <h3 className="font-black uppercase text-[#DB0A40] mb-8 text-xs tracking-widest border-b-8 border-gray-100 pb-4 flex items-center gap-4 italic">
                      <Filter size={20} /> {category}
                    </h3>
                    <div className="space-y-5">
                      {items.map((item) => (
                        <div key={item.id} className="flex items-center justify-between group">
                          <div className="flex items-center gap-5 cursor-pointer flex-1" onClick={() => toggleItem(item.id)}>
                            {item.checked ? <CheckCircle2 className="text-green-500" size={28} /> : <Circle className="text-gray-200 group-hover:text-[#DB0A40]" size={28} />}
                            <span className={`text-sm font-black transition-all ${item.checked ? 'line-through opacity-20 italic' : ''}`}>{item.name}</span>
                          </div>
                          <button onClick={() => removeItem(item.id)} className="text-gray-200 hover:text-red-500 opacity-0 group-hover:opacity-100 p-2"><Trash2 size={20} /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ADMIN VIEW */}
        {view === 'admin' && (
          <div className="space-y-12 animate-in fade-in duration-500">
            <h2 className="text-5xl md:text-7xl font-black uppercase tracking-tighter italic border-b-[12px] border-[#00162B] inline-block mb-10 text-[#00162B]">Admin HQ</h2>
            
            <div className="grid md:grid-cols-2 gap-10">
              <section className="bg-white p-8 border-4 border-[#00162B] shadow-[12px_12px_0px_0px_#00162B]">
                <h3 className="text-2xl font-black uppercase mb-8 flex items-center gap-4 border-b-4 border-[#DB0A40] pb-4 italic">
                  <Plane className="text-[#DB0A40]" /> Flight Control
                </h3>
                {flights.map(fl => (
                  <div key={fl.id} className="mb-8 p-6 bg-gray-50 border-4 border-[#00162B]/10">
                    <label className="text-[10px] font-black uppercase text-[#DB0A40] block mb-2 tracking-widest text-xs">{fl.type} Zeit</label>
                    <input 
                      type="text" 
                      value={fl.time} 
                      onChange={(e) => updateFlight(fl.id, 'time', e.target.value)} 
                      className="w-full border-4 border-[#00162B] px-4 py-3 font-black text-sm mb-4" 
                    />
                    <label className="text-[10px] font-black uppercase text-[#DB0A40] block mb-2 tracking-widest text-xs">{fl.type} Nummer</label>
                    <input 
                      type="text" 
                      value={fl.flightNo} 
                      onChange={(e) => updateFlight(fl.id, 'flightNo', e.target.value)} 
                      className="w-full border-4 border-[#00162B] px-4 py-3 font-black text-sm" 
                    />
                  </div>
                ))}
              </section>

              <section className="bg-white p-8 border-4 border-[#00162B] shadow-[12px_12px_0px_0px_#DB0A40]">
                <h3 className="text-2xl font-black uppercase mb-8 flex items-center gap-4 border-b-4 border-[#DB0A40] pb-4 italic">
                  <Bed className="text-[#DB0A40]" /> Camps
                </h3>
                <div className="space-y-6">
                  {accommodations.map(acc => (
                    <div key={acc.id} className="p-4 bg-gray-50 border-2 border-gray-100 hover:border-[#00162B] transition-colors">
                      <label className="text-[10px] font-black uppercase text-gray-400 block mb-1 text-xs">{acc.days}</label>
                      <input 
                        type="text" 
                        value={acc.name} 
                        onChange={(e) => updateAccommodation(acc.id, 'name', e.target.value)} 
                        className="w-full border-2 border-[#00162B] px-3 py-2 font-black text-sm" 
                      />
                    </div>
                  ))}
                </div>
              </section>
            </div>
            <div className="mt-12 text-center">
              <button 
                onClick={() => setShowSaveModal(true)} 
                className="bg-[#00162B] text-white px-12 py-5 font-black uppercase flex items-center gap-4 mx-auto hover:bg-[#DB0A40] transition-all shadow-[8px_8px_0px_0px_#DB0A40] italic text-xl"
              >
                <Save size={24} /> Mission Speichern
              </button>
            </div>
          </div>
        )}

        {/* BRIEFING MODAL */}
        {showBriefingModal && (
          <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 backdrop-blur-sm overflow-y-auto">
            <div className="bg-white border-8 border-[#00162B] p-6 md:p-10 max-w-2xl w-full shadow-[16px_16px_0px_0px_#DB0A40] animate-in zoom-in-95 duration-200 my-8 relative">
              <button 
                onClick={() => setShowBriefingModal(false)}
                className="absolute top-4 right-4 bg-gray-100 hover:bg-gray-200 p-2 rounded-full transition-colors"
              >
                <Trash2 size={24} className="text-[#00162B] hidden" /> {/* Hidden icon just for sizing if needed, but let's use a clear X or just text */}
                <span className="font-black text-[#00162B] px-2">X</span>
              </button>
              
              <div className="flex items-center gap-2 text-[#DB0A40] mb-2 font-black uppercase tracking-widest text-sm">
                <MapPin size={16} /> {currentDay.location}
              </div>
              <h3 className="text-4xl font-black uppercase italic text-[#00162B] mb-2">Tag {currentDay.day}: {currentDay.title}</h3>
              <p className="text-lg font-medium text-gray-600 mb-8 border-l-4 border-[#DB0A40] pl-4">{currentDay.description}</p>
              
              <div className="space-y-6 mb-8">
                {currentDay.details.map((detail, i) => (
                  <div key={i} className="flex gap-4 items-start">
                    <div className="text-3xl bg-gray-100 p-3 rounded-full border-2 border-[#00162B]">{detail.type}</div>
                    <div>
                      <h4 className="font-black text-lg uppercase text-[#00162B] mb-1">{detail.text}</h4>
                      <p className="text-gray-700 leading-relaxed">{detail.info}</p>
                    </div>
                  </div>
                ))}
              </div>

              {currentDay.researchTips && currentDay.researchTips.length > 0 && (
                <div className="bg-[#00162B] text-white p-6 mt-8">
                  <h4 className="font-black uppercase text-[#DB0A40] mb-4 flex items-center gap-2">
                    <Info size={20} />
                    Wichtige Hinweise
                  </h4>
                  <ul className="list-disc pl-5 space-y-2 font-medium">
                    {currentDay.researchTips.map((tip, i) => (
                      <li key={i}>{tip}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-8 flex justify-end">
                <button 
                  onClick={() => setShowBriefingModal(false)}
                  className="px-8 py-4 font-black uppercase text-sm bg-[#DB0A40] text-white hover:bg-[#00162B] transition-colors shadow-[4px_4px_0px_0px_#00162B]"
                >
                  Briefing schließen
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SAVE CONFIRMATION MODAL */}
        {showSaveModal && (
          <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white border-8 border-[#00162B] p-8 max-w-md w-full shadow-[16px_16px_0px_0px_#DB0A40] animate-in zoom-in-95 duration-200">
              <h3 className="text-3xl font-black uppercase italic text-[#00162B] mb-4">Änderungen speichern?</h3>
              <p className="text-gray-600 font-medium mb-8">
                Bist du sicher, dass du die Änderungen an der Mission speichern möchtest? Dies überschreibt die bisherigen Daten für alle Teilnehmer.
              </p>
              <div className="flex gap-4 justify-end">
                <button 
                  onClick={() => setShowSaveModal(false)}
                  className="px-6 py-3 font-black uppercase text-sm border-4 border-[#00162B] hover:bg-gray-100 transition-colors"
                >
                  Abbrechen
                </button>
                <button 
                  onClick={saveToFirebase}
                  className="px-6 py-3 font-black uppercase text-sm bg-[#DB0A40] text-white hover:bg-[#00162B] transition-colors shadow-[4px_4px_0px_0px_#00162B]"
                >
                  Speichern
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MAP VIEW */}
        {view === 'map' && renderMap()}
      </main>

      {/* MOBILE NAV OVERLAY */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#00162B] text-white flex justify-around p-5 md:hidden z-50 border-t-8 border-[#DB0A40] shadow-2xl">
        {[
          { id: 'plan', icon: Calendar, label: 'Plan' },
          { id: 'accommodations', icon: Bed, label: 'Sleep' },
          { id: 'packing', icon: Briefcase, label: 'Pack' },
          { id: 'admin', icon: Settings, label: 'Hq' }
        ].map(nav => (
          <button 
            key={nav.id}
            onClick={() => setView(nav.id)} 
            className={`flex flex-col items-center gap-1 transition-all ${view === nav.id ? 'text-[#DB0A40] scale-125 font-black' : 'opacity-30'}`}
          >
            <nav.icon size={24} />
            <span className="text-[9px] uppercase font-black">{nav.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default App;
