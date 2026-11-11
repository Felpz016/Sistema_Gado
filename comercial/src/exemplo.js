// Dados de exemplo usados só no modo demonstração.
export function exemplo() {
  const L = (id, numero, quantidade, sexo, raca, idadeMeses, pesoEntrada, dataEntrada, obs, ativo = true) =>
    ({ id, numero, quantidade, sexo, raca, idadeMeses, pesoEntrada, dataEntrada, obs, ativo });
  return {
    lotes: [
      L("l12", "L-012", 48, "M", "Nelore", 12, 262, "2026-06-15", "Comprado do Sítio Boa Vista."),
      L("l13", "L-013", 35, "F", "Nelore", 10, 236, "2026-07-02", ""),
      L("l14", "L-014", 60, "M", "Cruzado (Angus × Nelore)", 14, 301, "2026-08-10", "Leilão. Pasto 3."),
      L("l15", "L-015", 22, "F", "Brahman", 24, 378, "2026-09-05", "Novilhas para reprodução."),
      L("l09", "L-009", 40, "M", "Nelore", 13, 270, "2026-01-20", "", false),
    ],
    pesagens: [
      { id: "p1", loteId: "l09", data: "2026-05-20", peso: 352 },
      { id: "p2", loteId: "l09", data: "2026-08-25", peso: 448 },
      { id: "p3", loteId: "l12", data: "2026-08-14", peso: 298 },
      { id: "p4", loteId: "l12", data: "2026-10-20", peso: 338 },
      { id: "p5", loteId: "l13", data: "2026-09-01", peso: 262 },
      { id: "p6", loteId: "l13", data: "2026-10-20", peso: 283 },
      { id: "p7", loteId: "l14", data: "2026-10-28", peso: 338 },
    ],
    sanidade: [
      { id: "s1", loteId: "l12", data: "2026-06-16", procedimento: "Vermífugo (ivermectina 1%)", doseMl: 5 },
      { id: "s2", loteId: "l12", data: "2026-07-10", procedimento: "Vacina carbúnculo", doseMl: 2 },
      { id: "s3", loteId: "l14", data: "2026-11-03", procedimento: "Vacina carbúnculo", doseMl: 2 },
      { id: "s4", loteId: "l15", data: "2026-09-06", procedimento: "Vacina brucelose", doseMl: 2 },
    ],
    saidas: [
      { id: "x1", loteId: "l09", data: "2026-09-30", motivo: "Venda", destino: "Frigorífico", peso: 512, quantidade: 40, obs: "" },
    ],
  };
}
