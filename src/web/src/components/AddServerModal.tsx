import React from "react";
import { ServerModal, ServerModalProps } from "./ServerModal";

export type AddServerModalProps = Omit<ServerModalProps, "server">;

export const AddServerModal: React.FC<AddServerModalProps> = (props) => {
  return <ServerModal {...props} server={null} />;
};

export { ServerModal };
