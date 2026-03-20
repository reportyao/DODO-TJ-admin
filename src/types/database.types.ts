
export type Json = 
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      audit_logs: {
        Row: {
          id: string
          created_at: string
          user_id: string
          action: string
          target_table: string
          target_id: string
          details: Json | null
          ip_address: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          user_id: string
          action: string
          target_table: string
          target_id: string
          details?: Json | null
          ip_address?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          user_id?: string
          action?: string
          target_table?: string
          target_id?: string
          details?: Json | null
          ip_address?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'audit_logs_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      deposits: {
        Row: {
          amount: number
          created_at: string
          currency: Database['public']['Enums']['Currency']
          id: string
          payment_method: string | null
          status: Database['public']['Enums']['DepositStatus']
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency: Database['public']['Enums']['Currency']
          id?: string
          payment_method?: string | null
          status?: Database['public']['Enums']['DepositStatus']
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: Database['public']['Enums']['Currency']
          id?: string
          payment_method?: string | null
          status?: Database['public']['Enums']['DepositStatus']
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'deposits_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      lotteries: {
        Row: {
          created_at: string
          currency: Database['public']['Enums']['Currency']
          description: Json | null
          description_i18n: Json | null
          details_i18n: Json | null
          draw_time: string
          end_time: string
          id: string
          image_url: string | null
          max_per_user: number
          period: string
          start_time: string
          status: Database['public']['Enums']['LotteryStatus']
          ticket_price: number
          title: Json
          title_i18n: Json | null
          total_tickets: number
          sold_tickets: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency: Database['public']['Enums']['Currency']
          description?: Json | null
          description_i18n?: Json | null
          details_i18n?: Json | null
          draw_time: string
          end_time: string
          id?: string
          image_url?: string | null
          max_per_user?: number
          period: string
          start_time: string
          status?: Database['public']['Enums']['LotteryStatus']
          ticket_price: number
          title: Json
          title_i18n?: Json | null
          total_tickets: number
          sold_tickets?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: Database['public']['Enums']['Currency']
          description?: Json | null
          description_i18n?: Json | null
          details_i18n?: Json | null
          draw_time?: string
          end_time?: string
          id?: string
          image_url?: string | null
          max_per_user?: number
          period?: string
          start_time?: string
          status?: Database['public']['Enums']['LotteryStatus']
          ticket_price?: number
          title?: Json
          title_i18n?: Json | null
          total_tickets?: number
          sold_tickets?: number
          updated_at?: string
        }
        Relationships: []
      }
      lottery_results: {
        Row: {
          created_at: string
          draw_time: string
          id: string
          lottery_id: string
          timestamp_sum: string
          total_shares: number
          updated_at: string
          winner_id: string
          winning_number: number
          winning_ticket_id: string
        }
        Insert: {
          created_at?: string
          draw_time: string
          id?: string
          lottery_id: string
          timestamp_sum: string
          total_shares: number
          updated_at?: string
          winner_id: string
          winning_number: number
          winning_ticket_id: string
        }
        Update: {
          created_at?: string
          draw_time?: string
          id?: string
          lottery_id?: string
          timestamp_sum?: string
          total_shares?: number
          updated_at?: string
          winner_id?: string
          winning_number?: number
          winning_ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'lottery_results_lottery_id_fkey'
            columns: ['lottery_id']
            isOneToOne: false
            referencedRelation: 'lotteries'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'lottery_results_winner_id_fkey'
            columns: ['winner_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'lottery_results_winning_ticket_id_fkey'
            columns: ['winning_ticket_id']
            isOneToOne: false
            referencedRelation: 'tickets'
            referencedColumns: ['id']
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          currency: Database['public']['Enums']['Currency']
          id: string
          status: Database['public']['Enums']['OrderStatus']
          total_amount: number
          tracking_number: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency: Database['public']['Enums']['Currency']
          id?: string
          status?: Database['public']['Enums']['OrderStatus']
          total_amount: number
          tracking_number?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: Database['public']['Enums']['Currency']
          id?: string
          status?: Database['public']['Enums']['OrderStatus']
          total_amount?: number
          tracking_number?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'orders_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      payment_config: {
        Row: {
          id: number
          created_at: string
          updated_at: string
          alipay_app_id: string | null
          alipay_private_key: string | null
          alipay_public_key: string | null
          wechat_app_id: string | null
          wechat_mch_id: string | null
          wechat_api_key: string | null
          wechat_cert_path: string | null
          wechat_key_path: string | null
        }
        Insert: {
          id?: number
          created_at?: string
          updated_at?: string
          alipay_app_id?: string | null
          alipay_private_key?: string | null
          alipay_public_key?: string | null
          wechat_app_id?: string | null
          wechat_mch_id?: string | null
          wechat_api_key?: string | null
          wechat_cert_path?: string | null
          wechat_key_path?: string | null
        }
        Update: {
          id?: number
          created_at?: string
          updated_at?: string
          alipay_app_id?: string | null
          alipay_private_key?: string | null
          alipay_public_key?: string | null
          wechat_app_id?: string | null
          wechat_mch_id?: string | null
          wechat_api_key?: string | null
          wechat_cert_path?: string | null
          wechat_key_path?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          first_name: string | null
          id: string
          is_admin: boolean
          kyc_level: Database['public']['Enums']['KycLevel']
          last_name: string | null
          referral_code: string
          referrer_id: string | null
          status: Database['public']['Enums']['UserStatus']
          telegram_id?: string | null
          telegram_username?: string | null
          phone_number: string
          password_hash?: string | null
          whatsapp_opt_in?: boolean
          updated_at: string
          username: string | null,
          level: number,
          commission_rate: number
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          first_name?: string | null
          id: string
          is_admin?: boolean
          kyc_level?: Database['public']['Enums']['KycLevel']
          last_name?: string | null
          referral_code: string
          referrer_id?: string | null
          status?: Database['public']['Enums']['UserStatus']
          telegram_id?: string | null
          telegram_username?: string | null
          phone_number: string
          password_hash?: string | null
          whatsapp_opt_in?: boolean
          updated_at?: string
          username?: string | null,
          level?: number,
          commission_rate?: number
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          first_name?: string | null
          id?: string
          is_admin?: boolean
          kyc_level?: Database['public']['Enums']['KycLevel']
          last_name?: string | null
          referral_code?: string
          referrer_id?: string | null
          status?: Database['public']['Enums']['UserStatus']
          telegram_id?: string | null
          telegram_username?: string | null
          phone_number?: string
          password_hash?: string | null
          whatsapp_opt_in?: boolean
          updated_at?: string
          username?: string | null,
          level?: number,
          commission_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: 'profiles_id_fkey'
            columns: ['id']
            isOneToOne: true
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'profiles_referrer_id_fkey'
            columns: ['referrer_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      showoffs: {
        Row: {
          content: string
          created_at: string
          id: string
          image_url: string | null
          image_urls: string[] | null
          lottery_id: string
          prize_id: string | null
          status: Database['public']['Enums']['ShowoffStatus']
          title: string | null
          updated_at: string
          user_id: string
          likes_count: number
          comments_count: number
          reviewed_at: string | null
          rejected_reason: string | null
          approved_at: string | null
          reward_coins: number | null
          admin_note: string | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          image_url?: string | null
          image_urls?: string[] | null
          lottery_id: string
          prize_id?: string | null
          status?: Database['public']['Enums']['ShowoffStatus']
          title?: string | null
          updated_at?: string
          user_id: string
          likes_count?: number
          comments_count?: number
          reviewed_at?: string | null
          rejected_reason?: string | null
          approved_at?: string | null
          reward_coins?: number | null
          admin_note?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          image_url?: string | null
          image_urls?: string[] | null
          lottery_id?: string
          prize_id?: string | null
          status?: Database['public']['Enums']['ShowoffStatus']
          title?: string | null
          updated_at?: string
          user_id?: string
          likes_count?: number
          comments_count?: number
          reviewed_at?: string | null
          rejected_reason?: string | null
          approved_at?: string | null
          reward_coins?: number | null
          admin_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'showoffs_lottery_id_fkey'
            columns: ['lottery_id']
            isOneToOne: false
            referencedRelation: 'lotteries'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'showoffs_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      tickets: {
        Row: {
          created_at: string
          id: string
          lottery_id: string
          ticket_number: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lottery_id: string
          ticket_number: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lottery_id?: string
          ticket_number?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'tickets_lottery_id_fkey'
            columns: ['lottery_id']
            isOneToOne: false
            referencedRelation: 'lotteries'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'tickets_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      wallets: {
        Row: {
          balance: number
          created_at: string
          currency: Database['public']['Enums']['Currency']
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          currency: Database['public']['Enums']['Currency']
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          currency?: Database['public']['Enums']['Currency']
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'wallets_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      withdrawals: {
        Row: {
          amount: number
          created_at: string
          currency: Database['public']['Enums']['Currency']
          id: string
          status: Database['public']['Enums']['WithdrawalStatus']
          updated_at: string
          user_id: string
          withdrawal_address: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency: Database['public']['Enums']['Currency']
          id?: string
          status?: Database['public']['Enums']['WithdrawalStatus']
          updated_at?: string
          user_id: string
          withdrawal_address: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: Database['public']['Enums']['Currency']
          id?: string
          status?: Database['public']['Enums']['WithdrawalStatus']
          updated_at?: string
          user_id?: string
          withdrawal_address?: string
        }
        Relationships: [
          {
            foreignKeyName: 'withdrawals_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      draw_lottery: {
        Args: {
          p_lottery_id: string
        }
        Returns: {
          winning_number: number
        }
      }
    }
    Enums: {
      Currency: 'TJS' | 'USD'
      DepositStatus: 'PENDING' | 'APPROVED' | 'REJECTED'
      KycLevel: 'NONE' | 'LEVEL_1' | 'LEVEL_2'
      LotteryStatus: 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED'
      OrderStatus: 'PENDING' | 'PAID' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED'
      ShowoffStatus: 'PENDING' | 'APPROVED' | 'REJECTED'
      UserStatus: 'ACTIVE' | 'INACTIVE' | 'BANNED'
      WithdrawalStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

