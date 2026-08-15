import { NextResponse } from "next/server"; import { AuthRequiredError,getAuthenticatedUser } from "@/app/lib/supabase/server";
export const dynamic="force-dynamic";
export async function GET(){try{const user=await getAuthenticatedUser();return NextResponse.json({success:true,user:{id:user.id}});}catch(error){return NextResponse.json({success:false,user:null,error:error instanceof Error?error.message:"No se pudo validar la sesión."},{status:error instanceof AuthRequiredError?401:500});}}
