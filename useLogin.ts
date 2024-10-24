import { state } from "state";
import { useSnapshot } from "valtio";
import jwt from "jsonwebtoken";
import { JwtProps } from "app-lib/interface/jwt.interface";
import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useAccount, useSignMessage, useDisconnect } from "wagmi";
import { useWeb3Modal } from "@web3modal/wagmi/react";
import { api } from "utils/api";
import { createCookie, getCookie, deleteCookie } from "helpers/cookie";
import { InjectedConnector } from 'wagmi/connectors/injected';
import { WalletConnectConnector } from 'wagmi/connectors/walletConnect';

function parseToken(token: string): JwtProps {
    return jwt.decode(token) as JwtProps;
}

let loadProfilePromise: Promise<void> | null = null;
function loadProfile() {
    if (loadProfilePromise) return;

    const token = getCookie("jwt");
    if (!token) return;

    loadProfilePromise = api.get("/profile")
        .then(({ data: { data } }) => {
            state.profile = data;
        })
        .catch(error => console.log(error))
        .finally(() => loadProfilePromise = null);
}

let signMessageTimeout: any = null;

export const useLogin = function () {
    const router = useRouter();
    const { open } = useWeb3Modal({
        connectors: () => {
            return [
                new InjectedConnector({
                    chains: [],
                }),
                new WalletConnectConnector({
                    options: {
                        qrcode: true,
                        rpc: {
                            1: 'https://mainnet.infura.io/v3/YOUR_INFURA_PROJECT_ID', // Ethereum Mainnet
                            3: 'https://ropsten.infura.io/v3/YOUR_INFURA_PROJECT_ID', // Ropsten Testnet
                            4: 'https://rinkeby.infura.io/v3/YOUR_INFURA_PROJECT_ID', // Rinkeby Testnet
                            5: 'https://goerli.infura.io/v3/YOUR_INFURA_PROJECT_ID', // Goerli Testnet
                            42: 'https://kovan.infura.io/v3/YOUR_INFURA_PROJECT_ID', // Kovan Testnet
                            137: 'https://rpc-mainnet.maticvigil.com', // Polygon Mainnet
                            80001: 'https://rpc-mumbai.maticvigil.com', // Polygon Testnet (Mumbai)
                        },
                    },
                }),
            ];
        },
    });

    const { address } = useAccount();
    const { disconnect } = useDisconnect();
    const { profile } = useSnapshot(state);

    const [web3modalOpen, setWeb3modalOpen] = useState(false);
    const { data: signMessageData, signMessage, variables, error: signMessageError } = useSignMessage();

    const refcode = router.query.ref as string;

    useEffect(() => {
        if (!refcode) return;
        window.localStorage.setItem("refcode", refcode);
    }, [refcode]);

    useEffect(() => loadProfile(), []);

    function verifyWallet() {
        clearTimeout(signMessageTimeout);
        signMessageTimeout = setTimeout(() => {
            if (address && (!profile || profile?.wallet?.toLowerCase() !== address?.toLowerCase()) && !getCookie("jwt")) {
                const appDomain = new URL(String(process.env.WEBSITE)).host;
                signMessage({ message: `${appDomain} - connect wallet` });
            }
        }, 999);
    }

    function login() {
        if (!address) {
            setWeb3modalOpen(true);
            open();
        } else {
            verifyWallet();
        }
    }

    function logout() {
        disconnect();
        deleteCookie("jwt");
        state.profile = null;
    }

    useEffect(() => {
        if (web3modalOpen) setWeb3modalOpen(false);
        verifyWallet();
    }, [address]);

    useEffect(() => {
        if (!signMessageData) return;

        api.post("/profile/auth", {
            wallet: address,
            msg: variables?.message,
            sign: signMessageData,
            refcode: window.localStorage.getItem("refcode") || ""
        }).then(({ data: { data } }) => {
            createCookie({
                name: "jwt",
                value: data.token,
                date: new Date(parseToken(data.token)?.exp * 1000).toISOString()
            });
            delete data.token;
            state.profile = data;
        }).catch(error => console.log(error));

    }, [signMessageData]);

    useEffect(() => {
        if (!signMessageError) return;
        console.error({ signMessageError });
        disconnect();
    }, [signMessageError]);

    return {
        login,
        address,
        profile,
        logout
    };
};
