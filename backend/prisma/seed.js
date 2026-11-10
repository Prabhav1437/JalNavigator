const prisma = require('../database');

async function main() {
  await prisma.alert.deleteMany();
  await prisma.sensorReading.deleteMany();
  await prisma.complaint.deleteMany();
  await prisma.asset.deleteMany();

  const tank = await prisma.asset.create({
    data: {
      name: 'Rampur Central Overhead Tank',
      type: 'tank',
      latitude: 26.8467,
      longitude: 80.9462,
      status: 'Operational',
      village: 'Rampur'
    }
  });

  const borewell1 = await prisma.asset.create({
    data: {
      name: 'North Ward Borewell',
      type: 'borewell',
      latitude: 26.8520,
      longitude: 80.9510,
      status: 'Operational',
      village: 'Rampur'
    }
  });

  const borewell2 = await prisma.asset.create({
    data: {
      name: 'South Hamlet Borewell',
      type: 'borewell',
      latitude: 26.8410,
      longitude: 80.9420,
      status: 'Maintenance',
      village: 'Rampur'
    }
  });

  const pump = await prisma.asset.create({
    data: {
      name: 'Sector 2 Booster Pump',
      type: 'pump',
      latitude: 26.8490,
      longitude: 80.9440,
      status: 'Operational',
      village: 'Rampur'
    }
  });

  const pipeline = await prisma.asset.create({
    data: {
      name: 'Village Main Feeder Line',
      type: 'pipeline',
      latitude: 26.8480,
      longitude: 80.9485,
      status: 'Operational',
      village: 'Rampur'
    }
  });

  await prisma.complaint.createMany({
    data: [
      {
        title: 'Severe pipeline leakage near primary school',
        category: 'Pipeline leakage',
        description: 'Main distribution pipe is leaking clean drinking water onto the street.',
        latitude: 26.8475,
        longitude: 80.9470,
        status: 'Pending'
      },
      {
        title: 'Low pressure during morning supply',
        category: 'Low water pressure',
        description: 'Taps in East Hamlet barely have any trickle between 6 AM and 8 AM.',
        latitude: 26.8450,
        longitude: 80.9520,
        status: 'In Progress'
      },
      {
        title: 'Turbid water from public standpost',
        category: 'Dirty water',
        description: 'Water was yellowish brown yesterday morning.',
        latitude: 26.8430,
        longitude: 80.9410,
        status: 'Resolved'
      }
    ]
  });

  await prisma.sensorReading.createMany({
    data: [
      {
        assetId: tank.id,
        waterLevel: 15.5,
        flowRate: 14.2,
        pressure: 1.4
      },
      {
        assetId: pump.id,
        waterLevel: 72.0,
        flowRate: 18.5,
        pressure: 2.2
      },
      {
        assetId: borewell1.id,
        waterLevel: 60.0,
        flowRate: 12.0,
        pressure: 1.8
      }
    ]
  });

  await prisma.alert.create({
    data: {
      assetId: tank.id,
      message: 'Critical low water level (15.5%) detected at Rampur Central Overhead Tank',
      severity: 'Critical',
      status: 'Open'
    }
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
