import fs from 'node:fs/promises';
import { Command } from 'commander';

const program = new Command();

program
  .name('orders-cli')
  .description('CLI-інструмент для перегляду та аналізу замовлень інтернет-магазину')
  .version('1.0.0', '-v, --version', 'Вивести поточну версію програми')
  .helpOption('-h, --help', 'Вивести довідку про програму')
  .addHelpCommand('help [command]', 'Вивести довідку для конкретної команди')
  .option('-f, --file <path>', 'Шлях до JSON-файлу з даними', 'data.json');

program.configureOutput({
  writeErr: (str) => {
    if (str.includes('missing required argument')) {
      const match = str.match(/'([^']+)'/);
      console.error(`Помилка: пропущено обов'язковий аргумент '${match ? match[1] : ''}'.`);
    } else if (str.includes('unknown option')) {
      const match = str.match(/'([^']+)'/);
      console.error(`Помилка: невідома опція '${match ? match[1] : ''}'.`);
    } else if (str.includes('unknown command')) {
      const match = str.match(/'([^']+)'/);
      console.error(`Помилка: невідома команда '${match ? match[1] : ''}'.`);
    } else if (str.includes('option') && str.includes('argument missing')) {
      console.error('Помилка: для вказаної опції не передано обов\'язкове значення.');
    } else {
      console.error(`Помилка виклику: ${str.trim()}`);
    }
  }
});

async function loadData() {
  const options = program.opts();
  const filePath = options.file;

  let rawContent;
  try {
    rawContent = await fs.readFile(filePath, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error(`Помилка: файл за шляхом '${filePath}' не знайдено.`);
    } else {
      console.error(`Помилка читання файлу '${filePath}': ${err.message}`);
    }
    process.exit(1);
  }

  try {
    const parsed = JSON.parse(rawContent);
    if (!Array.isArray(parsed)) {
      console.error('Помилка структури: кореневим елементом JSON має бути масив.');
      process.exit(1);
    }
    return parsed;
  } catch {
    console.error(`Помилка: файл '${filePath}' містить некоректний JSON.`);
    process.exit(1);
  }
}

function parseOrderId(idStr) {
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) {
    console.error(`Помилка: ідентифікатор замовлення '${idStr}' має бути додатним цілим числом.`);
    process.exit(1);
  }
  return id;
}

function findOrderById(orders, idStr) {
  const id = parseOrderId(idStr);
  const order = orders.find((item) => item.orderId === id);
  if (!order) {
    console.error(`Помилка: замовлення з orderId ${id} не знайдено.`);
    process.exit(1);
  }
  return order;
}

await program.parseAsync(process.argv);
