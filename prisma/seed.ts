import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding initial data...');

  // 1. Create Default Users
  const adminPasswordHash = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      name: 'System Admin',
      passwordHash: adminPasswordHash,
      role: 'ADMIN',
      active: true,
    },
  });
  console.log(`Created/Ensured Admin user: ${admin.username} (password: admin123)`);

  const operatorPasswordHash = await bcrypt.hash('operator123', 10);
  const operator = await prisma.user.upsert({
    where: { username: 'operator' },
    update: {},
    create: {
      username: 'operator',
      name: 'Dispatch Operator',
      passwordHash: operatorPasswordHash,
      role: 'OPERATOR',
      active: true,
    },
  });
  console.log(`Created/Ensured Operator user: ${operator.username} (password: operator123)`);

  // 2. Default Companies
  const defaultCompanies = [
    { name: 'Delhivery', sortOrder: 1, isDefault: true },
    { name: 'Amazon', sortOrder: 2, isDefault: true },
    { name: 'Instamart', sortOrder: 3, isDefault: true },
    { name: 'CRED', sortOrder: 4, isDefault: true },
    { name: 'Flipkart', sortOrder: 5, isDefault: true },
    { name: 'Blinkit', sortOrder: 6, isDefault: true },
  ];

  for (const comp of defaultCompanies) {
    await prisma.company.upsert({
      where: { name: comp.name },
      update: {},
      create: {
        name: comp.name,
        sortOrder: comp.sortOrder,
        isDefault: comp.isDefault,
        active: true,
      },
    });
  }
  console.log('Created/Ensured 6 default companies.');

  // 3. Default Settings
  await prisma.setting.upsert({
    where: { key: 'duplicateCheckDays' },
    update: {},
    create: {
      key: 'duplicateCheckDays',
      value: 1,
    },
  });

  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
