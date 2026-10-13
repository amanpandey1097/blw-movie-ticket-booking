const SEAT_SECTIONS = [
  { name: 'First Class', price: 30, rows: ['A', 'B', 'C'], seatsPerRow: 12 },
  { name: 'Second Class', price: 20, rows: ['D', 'E', 'F', 'G', 'H', 'I', 'J'], seatsPerRow: 10 },
  { name: 'Third Class', price: 15, rows: ['K', 'L', 'M', 'N'], seatsPerRow: 8 },
];

const seatMap = new Map();
for (const section of SEAT_SECTIONS) {
  for (const row of section.rows) {
    for (let number = 1; number <= section.seatsPerRow; number += 1) {
      seatMap.set(`${row}${number}`, {
        seatId: `${row}${number}`,
        section: section.name,
        price: section.price,
      });
    }
  }
}

const ALL_SEAT_IDS = [...seatMap.keys()];

function normalizeSeatIds(rawSeatIds) {
  if (!Array.isArray(rawSeatIds) || rawSeatIds.length === 0) {
    throw new Error('Select at least one seat.');
  }

  if (rawSeatIds.length > 10) {
    throw new Error('A maximum of 10 seats can be booked at once.');
  }

  const normalized = rawSeatIds.map((seat) => String(seat).trim().toUpperCase());
  const unique = [...new Set(normalized)];

  if (unique.length !== normalized.length) {
    throw new Error('Duplicate seats are not allowed.');
  }

  const invalid = unique.filter((seatId) => !seatMap.has(seatId));
  if (invalid.length > 0) {
    throw new Error(`Invalid seat selection: ${invalid.join(', ')}`);
  }

  return unique;
}

function getSeatDetails(rawSeatIds) {
  const seatIds = normalizeSeatIds(rawSeatIds);
  return seatIds.map((seatId) => ({ ...seatMap.get(seatId) }));
}

function calculateTotal(seats) {
  return seats.reduce((sum, seat) => sum + seat.price, 0);
}

module.exports = {
  SEAT_SECTIONS,
  ALL_SEAT_IDS,
  normalizeSeatIds,
  getSeatDetails,
  calculateTotal,
};
