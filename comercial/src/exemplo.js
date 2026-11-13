// Dados de exemplo usados só no modo demonstração. As datas andam junto com o dia de hoje.
import { hojeISO, nDia, isoDia } from "./calc.js";

export function exemplo() {
  const H = nDia(hojeISO());
  const d = (n) => isoDia(H - n);          // n dias atrás
  const mes = (n) => d(n).slice(0, 7);

  const pastos = [
    { id: "pa1", nome: "Pasto 1", area: 20, capim: "Braquiária brizantha", piquetes: "1A, 1B", precos: [{ desde: d(150), valor: 730 }] },
    { id: "pa2", nome: "Pasto 2", area: 35, capim: "Mombaça", piquetes: "", precos: [{ desde: d(133), valor: 820 }, { desde: d(60), valor: 900 }] },
    { id: "pa3", nome: "Pasto 3", area: 28, capim: "Braquiária decumbens", piquetes: "", precos: [{ desde: d(200), valor: 650 }] },
    { id: "pa4", nome: "Pasto 4", area: 15, capim: "Tifton 85", piquetes: "", precos: [{ desde: d(297), valor: 1100 }] },
  ];
  const meds = [
    { id: "m1", nome: "Ivermectina 1%", precos: [{ desde: d(320), preco: 30, ml: 50 }, { desde: d(30), preco: 35, ml: 50 }] },
    { id: "m2", nome: "Vacina clostridiose", precos: [{ desde: d(320), preco: 62, ml: 100 }] },
    { id: "m3", nome: "Vacina aftosa", precos: [{ desde: d(320), preco: 85, ml: 100 }] },
    { id: "m4", nome: "Oxitetraciclina LA", precos: [{ desde: d(320), preco: 48, ml: 50 }] },
  ];
  const ingredientes = [
    { id: "i1", nome: "Milho moído", ms: 88, precos: [{ desde: d(320), valor: 1100 }, { desde: d(45), valor: 1180 }] },
    { id: "i2", nome: "Farelo de soja", ms: 89, precos: [{ desde: d(320), valor: 2100 }] },
    { id: "i3", nome: "Farelo de amendoim", ms: 90, precos: [{ desde: d(320), valor: 1700 }] },
    { id: "i4", nome: "Núcleo mineral", ms: 98, precos: [{ desde: d(320), valor: 3800 }] },
    { id: "i5", nome: "Silagem de milho", ms: 33, precos: [{ desde: d(320), valor: 420 }] },
  ];
  const dietas = [
    { id: "dt1", nome: "Recria 1%", versoes: [{ desde: d(320), pv: 1, itens: [{ ingId: "i1", pct: 60 }, { ingId: "i2", pct: 25 }, { ingId: "i3", pct: 10 }, { ingId: "i4", pct: 5 }] }] },
    { id: "dt2", nome: "Terminação 2%", versoes: [{ desde: d(320), pv: 2, itens: [{ ingId: "i5", pct: 50 }, { ingId: "i1", pct: 35 }, { ingId: "i2", pct: 12 }, { ingId: "i4", pct: 3 }] }] },
  ];

  const lotes = [], movs = [], tratos = [];
  const L = (id, numero, quantidade, sexo, raca, idadeMeses, pesoEntrada, dias, x) => {
    lotes.push({ id, numero, quantidade, sexo, raca, idadeMeses, pesoEntrada, dataEntrada: d(dias), obs: "", ativo: true, comissao: 0, frete: 0, origem: "", ...x.lote });
    movs.push({ id: "mv-" + id, loteId: id, data: d(dias), pastoId: x.pasto, piquete: x.piquete || "", inicial: true });
    tratos.push({ id: "tr-" + id, loteId: id, data: d(dias), dietaId: x.dieta || null, inicial: true });
  };
  L("l09", "009", 40, "M", "Nelore", 13, 270, 297, { pasto: "pa4", lote: { custoKg: 10.8, comissao: 1000, frete: 1500, origem: "Fazenda Santa Luzia", gmdEst: 0.7, ativo: false } });
  L("l10", "010", 30, "M", "Nelore", 12, 250, 200, { pasto: "pa3", lote: { custoKg: 11, comissao: 800, frete: 1200, origem: "Leilão de Araçatuba", gmdEst: 0.6, ativo: false, apartadoEm: d(60), criterio: "Peso: acima e abaixo de 330 kg" } });
  L("l10a", "010/1", 18, "M", "Nelore", 17, 348, 60, { pasto: "pa3", dieta: "dt2", lote: { custoKg: null, gmdEst: 1.1, origemId: "l10", criterio: "Peso: acima e abaixo de 330 kg" } });
  L("l10b", "010/2", 12, "M", "Nelore", 17, 302, 60, { pasto: "pa2", lote: { custoKg: null, gmdEst: 0.6, origemId: "l10", criterio: "Peso: acima e abaixo de 330 kg" } });
  L("l12", "012", 48, "M", "Nelore", 12, 262, 150, { pasto: "pa1", piquete: "1A", dieta: "dt1", lote: { custoKg: 11.5, comissao: 1200, frete: 1800, origem: "Sítio Boa Vista", gmdEst: 0.6 } });
  L("l13", "013", 35, "F", "Nelore", 10, 236, 133, { pasto: "pa2", lote: { custoKg: 10.2, frete: 900, origem: "Sítio Boa Vista", gmdEst: 0.5 } });
  L("l14", "014", 60, "M", "Cruzado (Angus × Nelore)", 14, 301, 95, { pasto: "pa2", lote: { custoKg: 12.1, comissao: 2500, frete: 3200, origem: "Leilão de Araçatuba", gmdEst: 0.8, obs: "Lote de terminação." } });
  L("l15", "015", 22, "F", "Brahman", 24, 378, 69, { pasto: "pa1", piquete: "1B", lote: { custoKg: 9.8, frete: 600, origem: "Fazenda Santa Luzia", gmdEst: 0.4, obs: "Novilhas." } });

  return {
    lotes, pastos, meds, ingredientes, dietas,
    movs: [...movs, { id: "mv1", loteId: "l14", data: d(40), pastoId: "pa3", piquete: "" }],
    tratos: [...tratos,
      { id: "tr1", loteId: "l09", data: d(120), dietaId: "dt2" },
      { id: "tr2", loteId: "l14", data: d(40), dietaId: "dt2" },
    ],
    gmds: [
      { id: "g1", loteId: "l09", data: d(120), gmd: 1.2, motivo: "Entrou na terminação" },
      { id: "g2", loteId: "l14", data: d(40), gmd: 1.2, motivo: "Entrou na terminação" },
    ],
    pesagens: [
      { id: "p1", loteId: "l09", data: d(177), peso: 352 },
      { id: "p2", loteId: "l09", data: d(80), peso: 462 },
      { id: "p8", loteId: "l10", data: d(60), peso: 330 },
      { id: "p3", loteId: "l12", data: d(90), peso: 298 },
      { id: "p4", loteId: "l12", data: d(24), peso: 338 },
      { id: "p5", loteId: "l13", data: d(72), peso: 262 },
      { id: "p6", loteId: "l13", data: d(24), peso: 283 },
      { id: "p7", loteId: "l14", data: d(16), peso: 384 },
      { id: "p9", loteId: "l10a", data: d(12), peso: 398 },
    ],
    sanidade: [
      { id: "s1", loteId: "l09", data: d(296), tipo: "protocolo", medId: "m1", ml: 216, mlCab: 5.4 },
      { id: "s2", loteId: "l10", data: d(199), tipo: "protocolo", medId: "m1", ml: 150, mlCab: 5 },
      { id: "s3", loteId: "l10", data: d(199), tipo: "protocolo", medId: "m2", ml: 150, mlCab: 5 },
      { id: "s4", loteId: "l12", data: d(149), tipo: "protocolo", medId: "m1", ml: 240, mlCab: 5 },
      { id: "s5", loteId: "l12", data: d(149), tipo: "protocolo", medId: "m2", ml: 240, mlCab: 5 },
      { id: "s6", loteId: "l13", data: d(132), tipo: "protocolo", medId: "m1", ml: 175, mlCab: 5 },
      { id: "s7", loteId: "l14", data: d(94), tipo: "protocolo", medId: "m1", ml: 360, mlCab: 6 },
      { id: "s8", loteId: "l14", data: d(94), tipo: "protocolo", medId: "m3", ml: 120, mlCab: 2 },
      { id: "s9", loteId: "l15", data: d(68), tipo: "protocolo", medId: "m2", ml: 110, mlCab: 5 },
      { id: "s10", loteId: "l12", data: d(20), tipo: "protocolo", medId: "m1", ml: 312, mlCab: 6.5 },
      { id: "s11", loteId: "l14", data: d(30), tipo: "tratamento", doenca: "Pneumonia", medId: "m4", ml: 60, animais: 3 },
      { id: "s12", loteId: "l12", data: d(55), tipo: "tratamento", doenca: "Tristeza parasitária", medId: "m4", ml: 40, animais: 2 },
      { id: "s13", loteId: "l13", data: d(41), tipo: "tratamento", doenca: "Pneumonia", medId: "m4", ml: 20, animais: 1 },
    ],
    saidas: [
      { id: "x1", loteId: "l09", data: d(44), tipo: "abate", destino: "Frigorífico São Luís", peso: 512, quantidade: 40, precoArroba: 315, rendEsp: 52, rendReal: 53.4, precoKg: null, obs: "" },
    ],
    custos: [
      { id: "c1", tipo: "fixo", descricao: "Salário do vaqueiro", categoria: "Funcionário", valor: 3200, mes: mes(320), recorrente: true },
      { id: "c2", tipo: "fixo", descricao: "Diesel do trator", categoria: "Diesel", valor: 900, mes: mes(320), recorrente: true },
      { id: "c3", tipo: "fixo", descricao: "Herbicida no Pasto 3", categoria: "Herbicida", valor: 1500, mes: mes(70), recorrente: false },
      { id: "c4", tipo: "geral", descricao: "Reforma do Pasto 4", data: d(210), valor: 36000, meses: 12 },
      { id: "c5", tipo: "geral", descricao: "Cerca nova na divisa", data: d(50), valor: 8400, meses: 24 },
    ],
  };
}
