"use client";

import { useState, useEffect } from "react";
import { supabase } from "./supabase";

export interface CompanyInfo {
  name: string;
  slogan: string;
  phone_mtn: string;
  phone_airtel: string;
  email: string;
  address: string;
}

const DEFAULT_COMPANY: CompanyInfo = {
  name: "Nzoko Transport",
  slogan: "Voyagez en toute sécurité avec Nzoko",
  phone_mtn: "06 XXX XX XX",
  phone_airtel: "05 XXX XX XX",
  email: "",
  address: "Brazzaville, Congo",
};

export function useCompany(): CompanyInfo {
  const [company, setCompany] = useState<CompanyInfo>(DEFAULT_COMPANY);

  useEffect(() => {
    loadCompany();
  }, []);

  async function loadCompany() {
    if (!supabase) return;
    const { data } = await supabase
      .from("company")
      .select("*")
      .limit(1)
      .single();

    if (data) {
      setCompany({
        name: data.name || DEFAULT_COMPANY.name,
        slogan: data.slogan || DEFAULT_COMPANY.slogan,
        phone_mtn: data.phone_mtn || DEFAULT_COMPANY.phone_mtn,
        phone_airtel: data.phone_airtel || DEFAULT_COMPANY.phone_airtel,
        email: data.email || DEFAULT_COMPANY.email,
        address: data.address || DEFAULT_COMPANY.address,
      });
    }
  }

  return company;
}
