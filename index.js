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

program
  .command('list')
  .description('Показати стислий список основних елементів даних (замовлень)')
  .option('-l, --limit <number>', 'Обмежити кількість показаних замовлень')
  .action(async (cmdOptions) => {
    const orders = await loadData();
    let result = orders;

    if (cmdOptions.limit !== undefined) {
      const limit = Number(cmdOptions.limit);
      if (!Number.isInteger(limit) || limit <= 0) {
        console.error(`Помилка: значення опції --limit ('${cmdOptions.limit}') має бути додатним цілим числом.`);
        process.exit(1);
      }
      result = orders.slice(0, limit);
    }

    if (result.length === 0) {
      console.log('Список замовлень порожній.');
      return;
    }

    console.log(`Показано замовлень: ${result.length} із ${orders.length}`);
    for (const order of result) {
      const customerName = `${order.customer.firstName} ${order.customer.lastName}`;
      const paidStatus = order.isPaid ? 'Оплачено' : 'Не оплачено';
      console.log(
        `[ID: ${order.orderId}] Клієнт: ${customerName} | Місто: ${order.deliveryAddress.city} | Статус: ${order.status} | ${paidStatus}`
      );
    }
  });

program
  .command('get')
  .description('Показати одне замовлення цілком за його ідентифікатором')
  .argument('<id>', 'Унікальний числовий ідентифікатор замовлення (orderId)')
  .action(async (id) => {
    const orders = await loadData();
    const order = findOrderById(orders, id);
    console.log(JSON.stringify(order, null, 2));
  });

program
  .command('field')
  .description('Показати значення окремого поля замовлення (підтримується вкладений шлях через крапку)')
  .argument('<id>', 'Унікальний числовий ідентифікатор замовлення (orderId)')
  .argument('<path>', 'Шлях до поля (наприклад: status, customer.phone, deliveryAddress.city, items.0.productName)')
  .action(async (id, fieldPath) => {
    const orders = await loadData();
    const order = findOrderById(orders, id);

    const keys = fieldPath.split('.');
    let current = order;

    for (const key of keys) {
      if (current === null || current === undefined || typeof current !== 'object' || !(key in current)) {
        console.error(`Помилка: поле за шляхом '${fieldPath}' відсутнє в замовленні №${order.orderId}.`);
        process.exit(1);
      }
      current = current[key];
    }

    if (current === null) {
      console.log(`Значення поля '${fieldPath}': null (значення явно відсутнє / не вказане)`);
    } else if (typeof current === 'object') {
      console.log(JSON.stringify(current, null, 2));
    } else {
      console.log(current);
    }
  });

program
  .command('items')
  .description('Показати позиції замовлення із сумою за кожну та можливістю сортування')
  .argument('<id>', 'Унікальний числовий ідентифікатор замовлення (orderId)')
  .option('-s, --sort <criteria>', 'Критерій сортування: sum, price, quantity, name', 'sum')
  .option('-d, --desc', 'Сортувати у порядку спадання', false)
  .action(async (id, cmdOptions) => {
    const orders = await loadData();
    const order = findOrderById(orders, id);

    const validCriteria = ['sum', 'price', 'quantity', 'name'];
    if (!validCriteria.includes(cmdOptions.sort)) {
      console.error(
        `Помилка: невідомий критерій сортування '${cmdOptions.sort}'. Доступні варіанти: ${validCriteria.join(', ')}.`
      );
      process.exit(1);
    }

    const enrichedItems = order.items.map((item) => ({
      ...item,
      lineTotal: Number((item.quantity * item.price).toFixed(2))
    }));

    enrichedItems.sort((a, b) => {
      let comparison = 0;
      if (cmdOptions.sort === 'sum') {
        comparison = a.lineTotal - b.lineTotal;
      } else if (cmdOptions.sort === 'price') {
        comparison = a.price - b.price;
      } else if (cmdOptions.sort === 'quantity') {
        comparison = a.quantity - b.quantity;
      } else if (cmdOptions.sort === 'name') {
        comparison = a.productName.localeCompare(b.productName);
      }
      return cmdOptions.desc ? -comparison : comparison;
    });

    console.log(`Позиції замовлення №${order.orderId} (сортування: ${cmdOptions.sort}, спадання: ${cmdOptions.desc ? 'так' : 'ні'}):`);
    for (const [index, item] of enrichedItems.entries()) {
      console.log(
        `${index + 1}. ${item.productName} | Кількість: ${item.quantity} шт. | Ціна: ${item.price.toFixed(2)} грн | Сума: ${item.lineTotal.toFixed(2)} грн`
      );
    }
  });

program
  .command('total')
  .description('Обчислити загальну суму замовлення')
  .argument('<id>', 'Унікальний числовий ідентифікатор замовлення (orderId)')
  .option('--apply-discount', 'Врахувати промокод на знижку, якщо він вказаний у замовленні', false)
  .action(async (id, cmdOptions) => {
    const orders = await loadData();
    const order = findOrderById(orders, id);

    const rawTotal = order.items.reduce((acc, item) => acc + item.quantity * item.price, 0);
    const totalPositions = order.items.reduce((acc, item) => acc + item.quantity, 0);

    console.log(`Замовлення №${order.orderId}`);
    console.log(`Кількість найменувань: ${order.items.length} (всього одиниць товару: ${totalPositions})`);
    console.log(`Базова сума замовлення: ${rawTotal.toFixed(2)} грн`);

    if (cmdOptions.applyDiscount) {
      if (order.discountCode) {
        const match = order.discountCode.match(/(\d+)$/);
        const discountPercent = match ? Number(match[1]) : 0;
        const discountAmount = (rawTotal * discountPercent) / 100;
        const finalTotal = rawTotal - discountAmount;
        console.log(`Промокод: ${order.discountCode} (-${discountPercent}%)`);
        console.log(`Сума зі знижкою: ${finalTotal.toFixed(2)} грн`);
      } else {
        console.log('Промокод: відсутній (null), знижка не застосовується.');
        console.log(`Підсумкова сума до сплати: ${rawTotal.toFixed(2)} грн`);
      }
    }
  });

program
  .command('summary')
  .description('Показати зведення про доставку й оплату для обраного замовлення')
  .argument('<id>', 'Унікальний числовий ідентифікатор замовлення (orderId)')
  .action(async (id) => {
    const orders = await loadData();
    const order = findOrderById(orders, id);

    const fullName = `${order.customer.firstName} ${order.customer.lastName}`;
    const phone = order.customer.phone ?? 'Не вказано (null)';
    const address = `${order.deliveryAddress.postalCode}, м. ${order.deliveryAddress.city}, ${order.deliveryAddress.street}`;
    const paymentState = order.isPaid ? 'Оплачено (true)' : 'Очікує оплати (false)';
    const promo = order.discountCode ?? 'Не застосовувався (null)';

    console.log(`=== Зведення замовлення №${order.orderId} ===`);
    console.log(`Отримувач:        ${fullName}`);
    console.log(`Телефон:          ${phone}`);
    console.log(`Адреса доставки:  ${address}`);
    console.log(`Спосіб оплати:    ${order.paymentMethod}`);
    console.log(`Стан оплати:      ${paymentState}`);
    console.log(`Промокод:         ${promo}`);
    console.log(`Поточний статус:  ${order.status}`);
  });

await program.parseAsync(process.argv);
