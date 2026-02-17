const ROLE_LABELS = {
  Owner: "Владелец",
  Admin: "Администратор",
  Member: "Участник"
};

export const getRoleLabel = (role) => ROLE_LABELS[String(role || "")] || String(role || "");
