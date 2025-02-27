const {
  TransaksiSpareparts,
  Spareparts,
  GudangMechanics,
  TransaksiSparepartHubs,
} = require("../models");
const {
  getRequestData,
  getSearchConditions,
  paginatedData,
} = require("../utils/helper");

const dataRelations = [
  {
    association: "sparepartDetail",
    attributes: {
      exclude: ["createdAt", "updatedAt"],
    },
    through: {
      attributes: ["jumlah", "harga"],
    },
  },
  {
    association: "sparepartHubs",
    attributes: {
      exclude: ["createdAt", "updatedAt"],
    },
  },
];

const searchable = [
  "noReferensi",
  "supplier",
  "name",
  "date",
  "type",
  "status",
];

const getRow = async (id) => {
  return await TransaksiSpareparts.findByPk(id, {
    attributes: {
      exclude: ["updatedAt", "date"],
    },
    include: dataRelations,
  });
};

// Get all data
exports.findAll = async (req, res) => {
  try {
    let conditions = getSearchConditions(req, searchable);
    const request = getRequestData(req, {
      orderBy: "id",
      orderDir: "ASC",
    });
    const data = await TransaksiSpareparts.findAndCountAll({
      attributes: {
        exclude: ["updatedAt", "date"],
      },
      distinct: true,
      where: conditions,
      include: dataRelations,
      order: [[request.orderby, request.orderdir]],
      limit: Number(request.limit),
      offset: Number(request.offset),
    });
    res.json(paginatedData(data, request.limit));
  } catch (err) {
    res.json({ message: err.message });
  }
};

// Get single data
exports.findOne = async (req, res) => {
  try {
    const data = await getRow(req.params.id);
    res.json(data);
  } catch (err) {
    res.json({ message: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { sparepartHubs } = req.body;
    const data = await TransaksiSpareparts.create(
      {
        ...req.body,
        sparepartHubs: req.body.sparepartHubs.map((item) => ({
          sparepart: item?.sparepart,
          jumlah: item?.jumlah,
          harga: item?.harga,
        })),
      },
      {
        include: [{ association: "sparepartHubs" }],
      }
    ).then(async (result) => {
      await sparepartHubs.forEach(async (item) => {
        const sparepart = await Spareparts.findByPk(item.sparepart);
        if (sparepart) {
          await Spareparts.update(
            {
              stok:
                result.type === "in"
                  ? sparepart.stok + item.jumlah
                  : sparepart.stok - item.jumlah,
            },
            {
              where: { id: item.sparepart },
            }
          );
        }

        if (result.type === "out") {
          const gudangmekanik = await GudangMechanics.findOne({
            where: { sparepart: sparepart.sparepart },
          });

          // kalau ada datanya
          // update
          if (gudangmekanik) {
            GudangMechanics.update(
              {
                merk: sparepart.merk,
                stok: gudangmekanik.stok + item.jumlah,
                namaBarang: sparepart.namaBarang,
                spesifikasi: sparepart.spesifikasi,
                kategori: sparepart.kategori,
              },
              {
                where: {
                  sparepart: sparepart.sparepart,
                },
              }
            );
          } else {
            // kalau gak ada, insert
            GudangMechanics.create({
              sparepart: sparepart.sparepart,
              merk: sparepart.merk,
              stok: item.jumlah,
              namaBarang: sparepart.namaBarang,
              spesifikasi: sparepart.spesifikasi,
              kategori: sparepart.kategori,
            });
          }
        }
      });
      return result;
    });
    res.json({
      message: "Transaksi Created successfully",
      data: await getRow(data?.id),
    });
  } catch (err) {
    res.json({ message: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    await TransaksiSpareparts.update(
      {
        noReferensi: req.body.noReferensi,
        supplier: req.body.supplier,
        name: req.body.name,
        type: req.body.type,
        status: req.body.status,
      },
      {
        where: { id: req.params.id },
      }
    );

    res.json({
      message: "Transaksi Updated successfully",
      data: await getRow(req.params.id),
    });
  } catch (err) {
    res.json({ message: err.message });
  }
};

exports.delete = async (req, res) => {
  try {
    const transaksiSparepart = await TransaksiSpareparts.findByPk(
      req.params.id,
      {
        raw: true,
      }
    );
    const sparepartHubs = await TransaksiSparepartHubs.findAll({
      where: { transaksiSparepart: req.params.id },
      raw: true,
    });

    // Jika type IN, sebelum dihapus di tabel sparepartHub
    // Maka jumlah di tabel sparepart dikurangi dengan jumlah yang ada di spareparthub
    if (transaksiSparepart.type === "in") {
      sparepartHubs.map(async (item) => {
        const sparepart = await Spareparts.findByPk(item?.sparepart, {
          raw: true,
        });
        await Spareparts.update(
          {
            stok: sparepart?.stok - item?.jumlah,
          },
          {
            where: { id: sparepart?.id },
          }
        );
      });
    }

    // Jika type OUT, sebelum dihapus di tabel sparepartHub
    // Maka jumlah di tabel gudangmekanik dikurangi dengan jumlah yang ada di spareparthub
    // dan ditambahkan ke stok tabel sparepart
    if (transaksiSparepart.type === "out") {
      sparepartHubs.map(async (item) => {
        const sparepart = await Spareparts.findByPk(item?.sparepart, {
          raw: true,
        });
        const gudangMekanik = await GudangMechanics.findAll({
          where: { sparepart: sparepart?.sparepart },
          raw: true,
        });

        // Kurangin stok di gudangMekanik dengan jumlah yang ada di item (sparepartHub)
        await GudangMechanics.update(
          {
            stok: gudangMekanik?.stok - item?.jumlah,
          },
          {
            where: { sparepart: sparepart?.sparepart },
          }
        );

        // Tambahkan stok di tabel sparepart dengan jumlah yang ada di item (sparepartHub)
        await Spareparts.update(
          {
            stok: sparepart?.stok + item?.jumlah,
          },
          {
            where: { id: sparepart?.id },
          }
        );
      });
    }

    await TransaksiSparepartHubs.destroy({
      where: { transaksiSparepart: req.params.id },
    });
    await TransaksiSpareparts.destroy({
      where: { id: req.params.id },
    });
    res.json({ message: "Transaksi Deleted successfully" });
  } catch (err) {
    res.json({ message: err.message });
  }
};
