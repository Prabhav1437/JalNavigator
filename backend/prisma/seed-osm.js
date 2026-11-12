const prisma = require('../database');

async function fetchOsmWaterAssets() {
  const query = `
    [out:json][timeout:25];
    (
      node["man_made"="water_tower"](26.75,80.85,26.95,81.05);
      node["man_made"="water_well"](26.75,80.85,26.95,81.05);
      node["amenity"="drinking_water"](26.75,80.85,26.95,81.05);
      node["man_made"="water_tap"](26.75,80.85,26.95,81.05);
    );
    out body 25;
  `;

  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'JalNavigator/1.0' }
  });

  if (!res.ok) {
    throw new Error(`Overpass API responded with status ${res.status}`);
  }

  const json = await res.json();
  return json.elements || [];
}

async function main() {
  console.log('Fetching live water infrastructure data from OpenStreetMap Overpass API...');
  const elements = await fetchOsmWaterAssets();
  console.log(`Retrieved ${elements.length} real water infrastructure assets.`);

  let createdCount = 0;
  for (const el of elements) {
    let type = 'tank';
    if (el.tags?.man_made === 'water_tower') type = 'tank';
    else if (el.tags?.man_made === 'water_well') type = 'borewell';
    else if (el.tags?.man_made === 'water_tap' || el.tags?.amenity === 'drinking_water') type = 'pump';

    const defaultName = type === 'tank'
      ? `Overhead Tank #${el.id}`
      : type === 'borewell'
      ? `Tube Well #${el.id}`
      : `Public Water Standpost #${el.id}`;

    const name = el.tags?.name || defaultName;
    const village = el.tags?.['addr:village'] || el.tags?.['addr:suburb'] || el.tags?.['addr:district'] || 'Lucknow Rural';

    const asset = await prisma.asset.create({
      data: {
        name,
        type,
        latitude: el.lat,
        longitude: el.lon,
        status: 'Operational',
        village
      }
    });

    const waterLevel = +(Math.random() * 80 + 15).toFixed(1);
    const flowRate = +(Math.random() * 20 + 5).toFixed(1);
    const pressure = +(Math.random() * 2.5 + 0.5).toFixed(1);

    await prisma.sensorReading.create({
      data: {
        assetId: asset.id,
        waterLevel,
        flowRate,
        pressure
      }
    });

    if (waterLevel < 20) {
      await prisma.alert.create({
        data: {
          assetId: asset.id,
          message: `Critical low water level (${waterLevel}%) detected at ${name}`,
          severity: 'Critical',
          status: 'Open'
        }
      });
    }

    createdCount++;
  }

  console.log(`Successfully seeded ${createdCount} live assets into the database.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

